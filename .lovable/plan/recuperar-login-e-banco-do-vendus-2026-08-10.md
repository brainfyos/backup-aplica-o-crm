# Recuperar login e banco do Vendus

## Diagnóstico confirmado

- O painel mostra falha ao carregar tabelas e views.
- O aplicativo registrou timeout de autenticação e falha ao buscar configurações da plataforma.
- O status externo do Lovable Cloud responde como ativo, porém uma consulta SQL mínima, as métricas do banco e a análise de consultas lentas falham por timeout de conexão.
- Portanto, o bloqueio atual está no backend/banco, não nas credenciais de um usuário específico nem na interface de login.
- A causa interna exata ainda não pode ser confirmada porque o próprio endpoint de métricas está inacessível. Não será feita alteração de código para mascarar uma indisponibilidade de infraestrutura.

## Plano de recuperação

1. Reiniciar de forma controlada a instância do Lovable Cloud para liberar conexões presas e restabelecer banco e autenticação.
2. Aguardar o backend voltar e validar, nesta ordem:
   - estado operacional do Cloud;
   - resposta de uma consulta SQL mínima;
   - métricas de banco e pool de conexões;
   - carregamento das tabelas no painel;
   - resposta do serviço de autenticação.
3. Testar um login real no Vendus e confirmar que a sessão é criada, o perfil é carregado e a rota autenticada abre sem o timeout de 8 segundos.
4. Com o banco estável, identificar a causa provável pelos indicadores disponíveis: saturação de conexões/memória, reinícios, transações revertidas, consultas lentas ou volume excessivo de chamadas.
5. Aplicar somente a correção sustentada pelos dados encontrados, como otimização de consulta/polling ou redimensionamento da instância se houver saturação real de compute.
6. Depois da recuperação, verificar o estado da migração da Mia que ficou indeterminado e executá-la somente se os objetos ainda estiverem ausentes; os quatro deploys já concluídos não serão repetidos.

## Segurança e preservação

- O restart não apaga dados, mas causa alguns minutos de indisponibilidade enquanto o backend reinicia.
- Nenhuma senha, chave, plano da Mia, dado de cliente ou configuração de autenticação será alterado.
- Nenhuma migration será aplicada antes de o banco responder e o estado atual ser verificado.

## Critérios de conclusão

- Banco responde a consultas e aparece no painel.
- Login cria sessão e carrega perfil/permissões sem timeout.
- Métricas ficam acessíveis e a causa é registrada com evidência objetiva.
- Operações pendentes são retomadas sem duplicação.