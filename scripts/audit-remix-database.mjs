import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineDir = join(root, 'supabase', 'migrations_shared');
const migrationsDir = join(root, 'supabase', 'migrations');
const bootstrapDir = join(root, 'supabase', 'remix_bootstrap');
const bootstrapManifestPath = join(bootstrapDir, 'manifest.json');
const bootstrapSqlPath = join(bootstrapDir, '0001_apply_database_contract.sql');

function dirHasSql(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => name.endsWith('.sql'));
}

if (process.env.SKIP_REMIX_DB_AUDIT === '1') {
  console.log('Auditoria de banco do Remix ignorada (SKIP_REMIX_DB_AUDIT=1).');
  process.exit(0);
}

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

const hasMigrations = dirHasSql(migrationsDir);
const hasBaseline = dirHasSql(baselineDir);

if (!hasBaseline) fail('supabase/migrations_shared ausente ou sem SQL');
if (!existsSync(bootstrapManifestPath)) fail('manifesto de bootstrap do Remix ausente');
if (!existsSync(bootstrapSqlPath)) fail('SQL determinístico de bootstrap do Remix ausente');

let bootstrapManifest = null;
if (existsSync(bootstrapManifestPath)) {
  try {
    bootstrapManifest = JSON.parse(readFileSync(bootstrapManifestPath, 'utf8'));
  } catch (error) {
    fail(`manifesto de bootstrap inválido: ${error.message}`);
  }
}

const expectedRuntimeContract = {
  schemaFingerprints: 10,
  securityFingerprints: 3,
  functionAclObjects: 58,
  relationAclObjects: 11,
  realtimeTables: 7,
  authTriggers: 2,
  cronJobs: 8,
  storageBuckets: 17,
  vaultSecrets: 1,
};
for (const [key, expected] of Object.entries(expectedRuntimeContract)) {
  if (bootstrapManifest?.expected?.[key] !== expected) {
    fail(`manifesto de bootstrap divergente em ${key}: esperado ${expected}`);
  }
}
for (const secret of ['AGENT_IMPORT_TOKEN', 'LAUNCH_META_INSIGHTS_SECRET']) {
  if (!bootstrapManifest?.expected?.requiredEdgeSecrets?.includes(secret)) {
    fail(`secret obrigatório ausente do manifesto: ${secret}`);
  }
}
if (existsSync(bootstrapSqlPath)) {
  const bootstrapSql = readFileSync(bootstrapSqlPath, 'utf8');
  if (!/^\s*(?:--[^\n]*\n)*SELECT\s+public\.reconcile_remix_database_contract\(\);\s*$/i.test(bootstrapSql)) {
    fail('bootstrap SQL deve chamar exclusivamente reconcile_remix_database_contract()');
  }
}

// A Lovable pode omitir o histórico supabase/migrations em um Remix. Isso não
// pode mais encerrar a auditoria em sucesso silencioso: nesse modo validamos o
// contrato portátil e os consumidores que certificam o snapshot em runtime.
if (!hasMigrations) {
  warnings.push('histórico supabase/migrations ausente; validando contrato pós-Remix');
  const requiredArtifacts = [
    ['supabase/functions/platform-bootstrap/index.ts', [
      'reconcile_remix_database_contract', 'ensure_platform_bootstrap', 'platform_health_report',
      'AGENT_IMPORT_TOKEN', 'LAUNCH_META_INSIGHTS_SECRET',
    ]],
    ['supabase/functions/setup-super-admin/index.ts', [
      'reconcile_remix_database_contract', 'ensure_platform_bootstrap',
    ]],
    ['src/components/superadmin/PlatformParityTab.tsx', [
      'schema_fingerprints', 'security_fingerprints', 'function_acls', 'relation_acls',
      'realtime_tables', 'unexpected_cron_jobs', 'certified',
    ]],
  ];
  for (const [relativePath, requiredStrings] of requiredArtifacts) {
    const path = join(root, relativePath);
    if (!existsSync(path)) {
      fail(`artefato de certificação ausente: ${relativePath}`);
      continue;
    }
    const source = readFileSync(path, 'utf8');
    for (const required of requiredStrings) {
      if (!source.includes(required)) fail(`${relativePath} não referencia ${required}`);
    }
  }

  if (warnings.length) {
    console.warn('\nAvisos do contrato Remix:');
    for (const warning of warnings) console.warn(`- ${warning}`);
  }
  if (errors.length) {
    console.error('\nContrato pós-Remix inválido:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const baselineCount = hasBaseline
    ? readdirSync(baselineDir).filter((name) => name.endsWith('.sql')).length
    : 0;
  console.log(`Contrato pós-Remix válido · ${baselineCount} baselines · auditoria runtime obrigatória`);
  process.exit(0);
}


function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path, extensions));
    else if (extensions.has(extname(entry))) files.push(path);
  }
  return files;
}

function readAll(files) {
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

const expectedBaseline = Array.from(
  { length: 7 },
  (_, index) => `0000000000000${index + 1}_`,
);
const baselineFiles = hasBaseline
  ? readdirSync(baselineDir).filter((name) => name.endsWith('.sql')).sort()
  : [];

for (const prefix of expectedBaseline) {
  if (!baselineFiles.some((name) => name.startsWith(prefix))) {
    fail(`baseline ausente: ${prefix}*.sql`);
  }
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const versions = new Map();

for (const name of migrationFiles) {
  const match = name.match(/^(\d{14})_.+\.sql$/);
  if (!match) {
    fail(`migration sem timestamp de 14 dígitos: ${name}`);
    continue;
  }
  const previous = versions.get(match[1]);
  if (previous) fail(`timestamp duplicado: ${previous} e ${name}`);
  versions.set(match[1], name);
}

const sqlFiles = [
  ...baselineFiles.map((name) => join(baselineDir, name)),
  ...migrationFiles.map((name) => join(migrationsDir, name)),
];
const sql = readAll(sqlFiles);

for (const file of sqlFiles) {
  const source = readFileSync(file, 'utf8');
  const dollarTags = new Map();
  for (const match of source.matchAll(/\$[a-zA-Z_0-9]*\$/g)) {
    dollarTags.set(match[0], (dollarTags.get(match[0]) ?? 0) + 1);
  }
  for (const [tag, count] of dollarTags) {
    if (count % 2 !== 0) {
      fail(`delimitador SQL ${tag} sem par em ${relative(root, file)}`);
    }
  }
}

const functionNames = new Set();
const functionPattern =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(?:"?public"?\.)?)"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
for (const match of sql.matchAll(functionPattern)) functionNames.add(match[1]);

const tableNames = new Set();
const tablePattern =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?public"?\.)?)"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
for (const match of sql.matchAll(tablePattern)) tableNames.add(match[1]);

const codeFiles = [
  ...walk(join(root, 'src'), new Set(['.ts', '.tsx'])),
  ...walk(join(root, 'supabase', 'functions'), new Set(['.ts', '.tsx'])),
];
const rpcCalls = new Map();
const rpcPattern = /\.rpc\s*\(\s*(['"`])([a-zA-Z_][a-zA-Z0-9_]*)\1/g;

for (const file of codeFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(rpcPattern)) {
    if (!rpcCalls.has(match[2])) rpcCalls.set(match[2], new Set());
    rpcCalls.get(match[2]).add(relative(root, file));
  }
}

for (const [rpc, callers] of [...rpcCalls].sort(([a], [b]) => a.localeCompare(b))) {
  if (!functionNames.has(rpc)) {
    fail(`RPC chamada sem migration: ${rpc} (${[...callers].join(', ')})`);
  }
}

const requiredFunctions = [
  '_mkt_can_read_org',
  'rpc_marketing_campaign_performance',
  'rpc_marketing_funnel',
  'rpc_marketing_ai_influence',
  'rpc_marketing_best_of',
  'rpc_record_commerce_sale',
  'rpc_remix_schema_health',
  'jsonb_merge_lead_metadata',
  'track_quiz_event',
];
const requiredTables = [
  'commerce_sales',
  'quiz_sessions',
  'quiz_step_events',
  'quiz_webhook_deliveries',
  'instagram_flow_continuations',
];
const requiredPlatformEmailTemplates = [
  'auth_signup_confirmation',
  'auth_invite',
  'auth_magic_link',
  'auth_password_recovery',
  'auth_email_change',
  'auth_reauthentication',
  'team_invite',
  'provisional_credentials',
  'welcome_admin_access',
  'booking_confirmation',
  'admin_notification',
  'onboarding-implantacao-link',
];

for (const name of requiredFunctions) {
  if (!functionNames.has(name)) fail(`função crítica sem migration: ${name}`);
}
for (const name of requiredTables) {
  if (!tableNames.has(name)) fail(`tabela crítica sem migration: ${name}`);
}
for (const slug of requiredPlatformEmailTemplates) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`['"]${escaped}['"]`).test(sql)) {
    fail(`template de e-mail da plataforma sem migration: ${slug}`);
  }
}

const platformEmailCallers = new Map();
const platformEmailCallPattern =
  /sendPlatformEmail\s*\(\s*\{[\s\S]{0,600}?slug\s*:\s*(['"])([^'"]+)\1/g;
for (const file of codeFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(platformEmailCallPattern)) {
    if (!platformEmailCallers.has(match[2])) platformEmailCallers.set(match[2], new Set());
    platformEmailCallers.get(match[2]).add(relative(root, file));
  }
}
for (const [slug, callers] of platformEmailCallers) {
  if (!requiredPlatformEmailTemplates.includes(slug)) {
    fail(`template chamado sem contrato canônico: ${slug} (${[...callers].join(', ')})`);
  }
}

const marketingFunctions = [
  '_mkt_can_read_org',
  'rpc_marketing_campaign_performance',
  'rpc_marketing_funnel',
  'rpc_marketing_ai_influence',
  'rpc_marketing_best_of',
];
for (const name of marketingFunctions) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const create = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${escaped}\\s*\\(`,
    'i',
  );
  const grant = new RegExp(
    `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${escaped}\\s*\\(`,
    'i',
  );
  if (!create.test(sql)) fail(`função de marketing sem public explícito: ${name}`);
  if (!grant.test(sql)) fail(`função de marketing sem GRANT EXECUTE: ${name}`);
}

const reconciliation =
  '20260728190000_remix_database_contract_reconciliation.sql';
if (!migrationFiles.includes(reconciliation)) {
  fail(`migration de reconciliação ausente: ${reconciliation}`);
} else {
  const reconciliationSql = readFileSync(
    join(migrationsDir, reconciliation),
    'utf8',
  );
  if (/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(reconciliationSql)) {
    fail('a migration de reconciliação contém uma operação destrutiva');
  }
  const securedFunctions = [
    ...marketingFunctions,
    'rpc_record_commerce_sale',
    'track_quiz_event',
    'jsonb_merge_lead_metadata',
    'rpc_remix_schema_health',
  ];

  for (const name of securedFunctions) {
    const startPattern = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      )}\\s*\\(`,
      'i',
    );
    const match = startPattern.exec(reconciliationSql);
    if (!match) continue;
    const nextFunction = reconciliationSql
      .slice(match.index + match[0].length)
      .search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/i);
    const end =
      nextFunction < 0
        ? reconciliationSql.length
        : match.index + match[0].length + nextFunction;
    const definition = reconciliationSql.slice(match.index, end);
    if (!/SECURITY\s+DEFINER/i.test(definition)) {
      fail(`função crítica sem SECURITY DEFINER: ${name}`);
    }
    if (!/SET\s+search_path\s*=\s*public/i.test(definition)) {
      fail(`função crítica sem search_path fixo: ${name}`);
    }
  }
}

const structureParity =
  '20260814180000_remix_database_structure_parity.sql';
if (!migrationFiles.includes(structureParity)) {
  fail(`migration de paridade estrutural ausente: ${structureParity}`);
} else {
  const structureParitySql = readFileSync(
    join(migrationsDir, structureParity),
    'utf8',
  );
  const functionContract = structureParitySql.match(
    /-- Function EXECUTE ACL contract[\s\S]*?\) AS expected\(signature, allow_anon, allow_authenticated\)/,
  )?.[0] ?? '';
  const relationContract = structureParitySql.match(
    /-- Relation ACL contract[\s\S]*?\) AS expected\(relation_name, anon_mode, authenticated_mode\)/,
  )?.[0] ?? '';
  const realtimeContract = structureParitySql.match(
    /-- Add only the seven entries present in production[\s\S]*?\) AS expected\(table_name\)/,
  )?.[0] ?? '';
  const functionCount = (
    functionContract.match(/^\s*\('public\.[^']+',\s*(?:true|false),\s*(?:true|false)\),?$/gm) ?? []
  ).length;
  const relationCount = (
    relationContract.match(/^\s*\('[a-z0-9_]+',\s*'[^']+',\s*'[^']+'\),?$/gm) ?? []
  ).length;
  const realtimeCount = (
    realtimeContract.match(/^\s*\('[a-z0-9_]+'\),?$/gm) ?? []
  ).length;

  if (functionCount !== 57) {
    fail(`contrato ACL de funcoes incompleto: ${functionCount}/57`);
  }
  if (relationCount !== 11) {
    fail(`contrato ACL de relacoes incompleto: ${relationCount}/11`);
  }
  if (realtimeCount !== 7) {
    fail(`contrato Realtime incompleto: ${realtimeCount}/7`);
  }
  if (/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM|UPDATE\s+public\.)\b/i.test(structureParitySql)) {
    fail('a migration de paridade estrutural contem uma operacao de dados destrutiva');
  }
  if (/GRANT\s+EXECUTE[\s\S]{0,180}?\sTO\s+PUBLIC/i.test(structureParitySql)) {
    fail('a migration de paridade estrutural reabre EXECUTE para PUBLIC');
  }
  if (!/lock_timeout', '5s'/.test(structureParitySql)) {
    fail('a migration de paridade estrutural nao limita espera por lock');
  }
  if (!/Remix parity post-check failed/.test(structureParitySql)) {
    fail('a migration de paridade estrutural nao possui pos-check atomico');
  }
}

const runtimeParity = '20260814223000_remix_runtime_parity_certification.sql';
const healthReportFix = '20260814234500_fix_platform_health_report_jsonb_counts.sql';
if (bootstrapManifest?.migration !== runtimeParity) {
  fail(`manifesto não aponta para a migration canônica: ${runtimeParity}`);
}
if (!migrationFiles.includes(runtimeParity)) {
  fail(`migration de certificação runtime ausente: ${runtimeParity}`);
} else {
  const runtimeSql = readFileSync(join(migrationsDir, runtimeParity), 'utf8');
  const contractSource = runtimeSql.match(
    /SELECT\s+\$contract\$([\s\S]*?)\$contract\$::jsonb/i,
  )?.[1];
  if (!contractSource) {
    fail('manifesto JSON não encontrado na migration de certificação runtime');
  } else {
    try {
      const contract = JSON.parse(contractSource);
      const counts = {
        schemaFingerprints: Object.keys(contract.schema_fingerprints ?? {}).length,
        securityFingerprints: Object.keys(contract.security_fingerprints ?? {}).length,
        functionAclObjects: contract.function_acls?.length,
        relationAclObjects: contract.relation_acls?.length,
        realtimeTables: contract.realtime_tables?.length,
        authTriggers: contract.auth_triggers?.length,
        cronJobs: contract.cron_jobs?.length,
        storageBuckets: contract.storage_buckets,
        vaultSecrets: contract.vault_secret_names?.length,
      };
      for (const [key, expected] of Object.entries(expectedRuntimeContract)) {
        if (counts[key] !== expected) fail(`contrato SQL divergente em ${key}: ${counts[key]}/${expected}`);
      }
      if (contract.version !== bootstrapManifest?.version) {
        fail('versão do contrato SQL diverge do manifesto portátil');
      }
      const expectedCrons = new Map([
        ['check-expired-subscriptions', '0 3 * * *'],
        ['marketing-ai-rules-tick', '*/30 * * * *'],
        ['marketing-sync-every-10min', '3-59/10 * * * *'],
        ['meta-template-status-watchdog-15min', '4-59/15 * * * *'],
        ['platform-health-snapshot-5min', '1-59/5 * * * *'],
        ['platform-worker-dispatcher-every-minute', '* * * * *'],
        ['purge-internal-history', '10 4 * * *'],
        ['sweep-stale-voice-calls', '2-59/5 * * * *'],
      ]);
      for (const job of contract.cron_jobs ?? []) {
        if (expectedCrons.get(job.name) !== job.schedule) {
          fail(`cron divergente do contrato canônico: ${job.name}`);
        }
        expectedCrons.delete(job.name);
      }
      for (const missing of expectedCrons.keys()) fail(`cron canônico ausente: ${missing}`);
      const passwordTrigger = contract.auth_triggers?.find(
        (trigger) => trigger.name === 'on_default_password_changed',
      );
      if (!passwordTrigger?.definition?.includes('AFTER UPDATE OF encrypted_password')) {
        fail('trigger de troca de senha não possui definição exata');
      }
    } catch (error) {
      fail(`manifesto JSON inválido na migration runtime: ${error.message}`);
    }
  }
  for (const required of [
    'CREATE OR REPLACE FUNCTION public.reconcile_remix_database_contract()',
    'CREATE OR REPLACE FUNCTION public.platform_health_report()',
    'CREATE OR REPLACE FUNCTION public.ensure_platform_bootstrap',
    'SELECT public.reconcile_remix_database_contract();',
    'GRANT EXECUTE ON FUNCTION public.reconcile_remix_database_contract() TO service_role',
  ]) {
    if (!runtimeSql.includes(required)) fail(`migration runtime não contém: ${required}`);
  }
  if (/INSERT\s+INTO\s+public\.profiles/i.test(runtimeSql)) {
    fail('migration runtime não pode reparar dados de perfis');
  }
}

if (!migrationFiles.includes(healthReportFix)) {
  fail(`migration corretiva ausente: ${healthReportFix}`);
} else {
  const healthReportFixSql = readFileSync(join(migrationsDir, healthReportFix), 'utf8');
  for (const required of [
    "jsonb_object_keys(public.remix_database_contract()->''schema_fingerprints'')",
    "jsonb_object_keys(public.remix_database_contract()->''security_fingerprints'')",
    'GRANT EXECUTE ON FUNCTION public.platform_health_report() TO service_role',
  ]) {
    if (!healthReportFixSql.includes(required)) {
      fail(`migration corretiva do relatório não contém: ${required}`);
    }
  }
  if (!healthReportFixSql.includes("position('jsonb_object_length' IN lower(corrected_definition)) > 0")) {
    fail('migration corretiva do relatório não possui pós-check de compatibilidade');
  }
}

// DDL belongs in versioned SQL, never inside browser or Edge Function code.
const ddlPattern =
  /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)\b/i;
for (const file of codeFiles) {
  if (ddlPattern.test(readFileSync(file, 'utf8'))) {
    warnings.push(`DDL encontrado fora de migrations: ${relative(root, file)}`);
  }
}

if (warnings.length) {
  console.warn('\nAvisos do contrato Remix:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error('\nContrato de banco do Remix inválido:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  [
    'Contrato de banco do Remix válido.',
    `${baselineFiles.length} baselines`,
    `${migrationFiles.length} migrations`,
    `${functionNames.size} funções versionadas`,
    `${tableNames.size} tabelas versionadas`,
    `${rpcCalls.size} RPCs estáticas verificadas`,
  ].join(' · '),
);
