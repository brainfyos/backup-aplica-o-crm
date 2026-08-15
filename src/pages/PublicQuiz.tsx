import PublicQuizRunner from './PublicQuizRunner';

/**
 * Página pública do Quiz — usa renderer dedicado em padrão inlead
 * (form-style, 1 tela por bloco), sem header de bot / balões.
 */
export default function PublicQuiz() {
  return <PublicQuizRunner />;
}
