import { obterBanco } from "@/db";
import { obterConta } from "@/lib/servidor/dal";
import { lerArquivo } from "@/lib/servidor/anexos-nucleo";

// Download de anexo: exige sessão (a rota não é pública no proxy, mas a
// checagem de verdade é aqui). Imagem e PDF abrem no navegador; o resto
// baixa. nosniff + CSP impedem que um arquivo vire página executável.
const ABRE_NO_NAVEGADOR = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

export async function GET(_req: Request, ctx: RouteContext<"/api/anexos/[id]">) {
  if (!(await obterConta())) return new Response("Entre na sua conta.", { status: 401 });
  const { id } = await ctx.params;
  const a = await lerArquivo(obterBanco(), id);
  if (!a) return new Response("Anexo não encontrado.", { status: 404 });
  const disposicao = ABRE_NO_NAVEGADOR.has(a.tipo) ? "inline" : "attachment";
  return new Response(new Uint8Array(a.bytes), {
    headers: {
      "Content-Type": a.tipo,
      "Content-Length": String(a.bytes.byteLength),
      "Content-Disposition": `${disposicao}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
