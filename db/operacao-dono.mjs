// Operação (A3): cria a conta do dono (o Ítalo) e as frentes, e mostra UMA
// VEZ um link de convite para ele definir a senha. Roda na VPS com o usuário
// admin do banco (ver infra/README.md, "Conta do dono").
//
// Variáveis: MIGRACAO_DATABASE_URL, SITE_URL, DONO_NOME, DONO_EMAIL, DONO_WHATSAPP.
// Opcionais: CONVIDADO_NOME, CONVIDADO_EMAIL, CONVIDADO_WHATSAPP — gera também
// um convite de conta nova, em nome do dono (ex.: para o Eduardo testar).
// Rodar de novo é seguro: não cria segundo dono nem duplica frentes; só gera
// um link novo para o dono (útil se ele perder o primeiro).
//
// O hash do token é o mesmo de lib/servidor/sessao-nucleo.ts (SHA-256 em hex).
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const FRENTES = [
  "Campanhas e tráfego",
  "Eventos presenciais",
  "Conteúdo e redes",
  "VSL e formação",
  "Comercial",
  "Suporte às alunas",
  "Administrativo",
];
const VALIDADE_MS = 72 * 60 * 60 * 1000;

function exigir(nome) {
  const v = process.env[nome]?.trim();
  if (!v) {
    console.error(`Falta a variável ${nome}.`);
    process.exit(1);
  }
  return v;
}

const url = exigir("MIGRACAO_DATABASE_URL");
const site = exigir("SITE_URL").replace(/\/$/, "");
const nome = exigir("DONO_NOME");
const email = exigir("DONO_EMAIL").toLowerCase();
const whatsapp = exigir("DONO_WHATSAPP");

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query("BEGIN");

  let { rows } = await cliente.query("SELECT id, email FROM usuarios WHERE dono");
  let donoId;
  if (rows.length) {
    donoId = rows[0].id;
    if (rows[0].email.toLowerCase() !== email) {
      throw new Error(`Já existe um dono (${rows[0].email}). Trocar o dono é uma operação à parte.`);
    }
    console.log("Dono já existia; gerando um link novo.");
  } else {
    ({ rows } = await cliente.query(
      `INSERT INTO usuarios (nome, email, telefone_whatsapp, dono, gerencia_acessos)
       VALUES ($1, $2, $3, true, true) RETURNING id`,
      [nome, email, whatsapp]
    ));
    donoId = rows[0].id;
    await cliente.query("INSERT INTO eventos_acesso (tipo, alvo_id, detalhes) VALUES ('conta_criada', $1, $2)", [
      donoId,
      JSON.stringify({ origem: "operacao-dono" }),
    ]);
    console.log(`Conta do dono criada: ${nome} <${email}>`);
  }

  const { rows: existentes } = await cliente.query("SELECT count(*)::int AS n FROM frentes");
  if (existentes[0].n === 0) {
    for (const frente of FRENTES) {
      await cliente.query("INSERT INTO frentes (nome, referencia_id) VALUES ($1, NULL)", [frente]);
    }
    console.log(`${FRENTES.length} frentes criadas.`);
  }

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const expira = new Date(Date.now() + VALIDADE_MS);
  await cliente.query(
    `INSERT INTO convites (token_hash, nome, email, telefone_whatsapp, criado_por_id, expira_em)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hash, nome, email, whatsapp, donoId, expira]
  );
  await cliente.query("INSERT INTO eventos_acesso (tipo, ator_id, alvo_id, detalhes) VALUES ('convite_criado', $1, $1, $2)", [
    donoId,
    JSON.stringify({ origem: "operacao-dono" }),
  ]);

  await cliente.query("COMMIT");
  console.log("\nLink para o dono definir a senha (vale 72h, uso único; não é mostrado de novo):");
  console.log(`${site}/convite/${token}\n`);
} catch (erro) {
  await cliente.query("ROLLBACK");
  console.error("Nada foi gravado:", erro.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
