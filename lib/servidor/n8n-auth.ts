import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// As rotas /api/n8n/* não usam cookie (o proxy deixa passar): exigem
// "Authorization: Bearer <N8N_TOKEN>". Sem token configurado, ficam
// desligadas em vez de abertas.
export function autorizarN8n(req: Request): Response | null {
  const esperado = process.env.N8N_TOKEN ?? "";
  if (esperado.length < 32) return Response.json({ erro: "Integração com o n8n não configurada." }, { status: 503 });
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Compara os hashes: mesmo tamanho sempre, e sem vazar tempo de comparação.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  if (!recebido || !timingSafeEqual(a, b)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  return null;
}
