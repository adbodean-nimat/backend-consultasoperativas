import "dotenv/config";
import { generarPdfsAvisosDeudaRevendedores } from "./src/services/generarAvisos.service.js";

try {
  const resultados = await generarPdfsAvisosDeudaRevendedores();
  console.table(resultados);
} catch (error) {
  console.error("Error:", error);
}
