/**
 * Conventional Commits — validación de mensajes de commit (§8.2).
 * Se aplica en CI (.github/workflows/commitlint.yml) sobre los commits del PR.
 *
 * Tipos permitidos: feat, fix, docs, style, refactor, perf, test, build, ci,
 * chore, revert (config-conventional).
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // El cuerpo/asunto del proyecto está en español; relajamos la longitud máxima
    // del asunto para permitir descripciones claras.
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
