import type { presence as en } from "./cloud-presence-en.js";

/** Las palabras de la presencia, entrada por entrada como en `cloud-presence-en.ts`. */
export const presence: typeof en = {
  group: "Personas en este proyecto",
  unnamed: "Alguien",
  person: (name, file) => (file === undefined ? name : `${name}, en ${file}`),
  go: (file) => `Ir a ${file}`,
  noFile: "Sin ningún archivo de este proyecto abierto",
  more: (count) => `+${count}`,
  moreName: (count) => `${count} personas más`,
  moreMenu: "Más personas en este proyecto",
};
