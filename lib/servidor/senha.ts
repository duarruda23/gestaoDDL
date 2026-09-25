import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Hash de senha com scrypt (embutido no Node; resistente a força bruta por
// exigir memória). Parâmetros no mínimo recomendado pela OWASP para scrypt:
// N=2^17, r=8, p=1 — cada verificação usa ~128 MB por ~0,3 s, o que cabe
// folgado no limite de 768 MB do container. Formato guardado:
//   scrypt$N$r$p$sal_base64$hash_base64
// Os parâmetros vão junto no texto, então dá para endurecer depois sem
// invalidar as senhas antigas.

// Nos testes automáticos (Vitest define NODE_ENV=test) usa custo baixo só
// para a suíte rodar rápido; senhas de teste nunca chegam à produção.
const N = process.env.NODE_ENV === "test" ? 2 ** 12 : 2 ** 17;
const R = 8;
const P = 1;
const TAMANHO = 64;

function scrypt(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  // 128·N·r é o uso real de memória; maxmem dá o dobro de folga.
  const opcoes: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r };
  return new Promise((resolve, reject) =>
    scryptCb(senha.normalize("NFKC"), sal, TAMANHO, opcoes, (erro, chave) => (erro ? reject(erro) : resolve(chave)))
  );
}

export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardado: string | null | undefined): Promise<boolean> {
  if (!guardado) return false;
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, "base64");
  const obtido = await scrypt(senha, Buffer.from(salB64, "base64"), Number(n), Number(r), Number(p));
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

// Hash de uma senha qualquer, calculado uma vez: usado para gastar o mesmo
// tempo quando o e-mail não existe (não revela quais e-mails têm conta).
let hashFalso: Promise<string> | null = null;
export function hashDeSenhaFalso(): Promise<string> {
  hashFalso ??= gerarHashDeSenha(randomBytes(12).toString("hex"));
  return hashFalso;
}

export { SENHA_MINIMA, problemaNaSenha } from "./senha-regras";
