'use strict';
/* ============================================================
   Dante's — servidor (sem dependências: só Node, nada de npm install)
   • Site do cliente ........ http://localhost:3000/
   • Painel do dono ......... http://localhost:3000/admin/
   • Dados salvos em ........ dados/db.json  (faça backup desse arquivo)
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_SENHA = process.env.ADMIN_SENHA || ''; // vazio = API do dono desligada
const DIR = __dirname;
const PUBLIC = path.join(DIR, 'public');
const ADMIN = path.join(DIR, 'admin');
const DADOS_DIR = process.env.DADOS_DIR || path.join(DIR, 'dados');
const DB_FILE = path.join(DADOS_DIR, 'db.json');
const conteudo = JSON.parse(fs.readFileSync(path.join(DIR, 'conteudo.json'), 'utf8'));

/* ---------------- banco (arquivo JSON, gravação atômica) ---------------- */
const HORAS = ['18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
const configPadrao = () => ({
  mesasPorHorario: 8,            // quantas reservas cabem no mesmo horário
  maxPessoas: 12,                // máximo de pessoas por reserva
  diasMax: 60,                   // até quantos dias à frente se pode reservar
  confirmacaoAutomatica: false,  // false = dono precisa confirmar cada pedido
  semana: Array.from({ length: 7 }, () => ({ aberto: true, horarios: [...HORAS] })) // 0 = domingo
});
let db;
function carregar() {
  fs.mkdirSync(DADOS_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.config = { ...configPadrao(), ...(db.config || {}) };
    db.excecoes = db.excecoes || []; db.usuarios = db.usuarios || []; db.reservas = db.reservas || [];
  } else {
    db = { segredo: crypto.randomBytes(32).toString('hex'), config: configPadrao(), excecoes: [], usuarios: [], reservas: [] };
  }
  salvar();
}
function salvar() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- datas (sempre no horário de Brasília) ---------------- */
function agora() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { data: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` };
}
const dataValida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const horaValida = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const diaSemana = (s) => new Date(s + 'T12:00:00Z').getUTCDay();
function somaDias(s, n) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/* ---------------- regras de reserva ---------------- */
const ATIVAS = ['pendente', 'confirmada'];
const ocupadas = (data, hora) => db.reservas.filter((r) => r.data === data && r.hora === hora && ATIVAS.includes(r.status)).length;
const erro = (status, msg) => Object.assign(new Error(msg), { status });

function disponibilidade(data) {
  if (!dataValida(data)) throw erro(400, 'Data inválida.');
  const ag = agora();
  if (data < ag.data) return { aberto: false, motivo: 'Essa data já passou.', horarios: [] };
  if (data > somaDias(ag.data, db.config.diasMax)) return { aberto: false, motivo: `Reservas abertas só para os próximos ${db.config.diasMax} dias.`, horarios: [] };
  const exc = db.excecoes.find((e) => e.data === data);
  if (exc && exc.fechado) return { aberto: false, motivo: exc.motivo || 'Fechado nesse dia.', horarios: [] };
  const dia = db.config.semana[diaSemana(data)];
  let horas;
  if (exc && exc.horarios && exc.horarios.length) horas = exc.horarios;
  else if (!dia.aberto) return { aberto: false, motivo: 'Não abrimos nesse dia da semana.', horarios: [] };
  else horas = dia.horarios;
  const horarios = [...horas].sort()
    .filter((h) => data > ag.data || h > ag.hora)
    .map((h) => ({ hora: h, vagas: Math.max(0, db.config.mesasPorHorario - ocupadas(data, h)) }));
  if (!horarios.length) return { aberto: false, motivo: 'Não há mais horários nesse dia.', horarios: [] };
  return { aberto: true, motivo: (exc && exc.motivo) || '', horarios };
}

const limpa = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const publica = (r) => ({ id: r.id, data: r.data, hora: r.hora, pessoas: r.pessoas, obs: r.obs, status: r.status, criadaEm: r.criadaEm });

function criarReserva(user, b) {
  const data = String(b.data || ''), hora = String(b.hora || ''), pessoas = Number.parseInt(b.pessoas, 10);
  if (!dataValida(data)) throw erro(400, 'Escolha um dia válido.');
  if (!horaValida(hora)) throw erro(400, 'Escolha um horário.');
  if (!(pessoas >= 1 && pessoas <= db.config.maxPessoas)) throw erro(400, `Para mais de ${db.config.maxPessoas} pessoas, fale com a gente pelo WhatsApp.`);
  const disp = disponibilidade(data);
  if (!disp.aberto) throw erro(409, disp.motivo || 'Esse dia não está disponível.');
  const slot = disp.horarios.find((h) => h.hora === hora);
  if (!slot) throw erro(409, 'Esse horário não está disponível.');
  if (slot.vagas <= 0) throw erro(409, 'Esse horário acabou de lotar. Escolha outro.');
  const hoje = agora().data;
  const minhas = db.reservas.filter((r) => r.usuarioId === user.id && ATIVAS.includes(r.status) && r.data >= hoje);
  if (minhas.some((r) => r.data === data && r.hora === hora)) throw erro(409, 'Você já tem uma reserva nesse dia e horário.');
  if (minhas.length >= 5) throw erro(429, 'Você já tem 5 reservas ativas. Cancele alguma ou fale com a gente.');
  let id; do { id = crypto.randomBytes(4).toString('hex').toUpperCase(); } while (db.reservas.some((r) => r.id === id));
  const r = {
    id, usuarioId: user.id, nome: user.nome, email: user.email,
    telefone: limpa(b.telefone, 20), data, hora, pessoas, obs: limpa(b.obs, 300),
    status: db.config.confirmacaoAutomatica ? 'confirmada' : 'pendente', criadaEm: new Date().toISOString()
  };
  db.reservas.push(r); salvar();
  return r;
}

/* ---------------- autenticação (cookie assinado) ---------------- */
function assinar(obj) {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', db.segredo).update(p).digest('base64url');
}
function verificar(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [p, s] = tok.split('.');
  const e = crypto.createHmac('sha256', db.segredo).update(p).digest('base64url');
  const a = Buffer.from(String(s)), b = Buffer.from(e);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp && o.exp < Date.now() ? null : o; } catch (e2) { return null; }
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((x) => x[0]));
const cookie = (nome, valor, seg) => `${nome}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seg}`;
function clienteDe(req) { const o = verificar(cookies(req).dantes_cli); return o && o.r === 'cli' ? db.usuarios.find((u) => u.id === o.id) || null : null; }
function adminDe(req) { const o = verificar(cookies(req).dantes_admin); return !!(o && o.r === 'admin'); }
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const senhaOk = (s) => !!ADMIN_SENHA && crypto.timingSafeEqual(hash(s), hash(ADMIN_SENHA));
const falhas = new Map();
const bloqueado = (ip) => { const f = falhas.get(ip); return !!(f && f.n >= 5 && Date.now() - f.t < 600000); };
function falhou(ip) { const f = falhas.get(ip); if (!f || Date.now() - f.t >= 600000) falhas.set(ip, { n: 1, t: Date.now() }); else f.n++; }

/* ---------------- http ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'same-origin' };
function json(res, status, obj, extra) { res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...(extra || {}) }); res.end(JSON.stringify(obj)); }
function lerCorpo(req) {
  return new Promise((ok, no) => {
    const ch = []; let tam = 0;
    req.on('data', (c) => { tam += c.length; if (tam > 50000) { no(erro(413, 'Pedido grande demais.')); req.destroy(); } else ch.push(c); });
    req.on('end', () => { if (!ch.length) return ok({}); try { ok(JSON.parse(Buffer.concat(ch).toString())); } catch (e) { no(erro(400, 'Pedido inválido.')); } });
    req.on('error', no);
  });
}
function estatico(res, base, rel) {
  let p; try { p = path.normalize(decodeURIComponent(rel)); } catch (e) { return json(res, 400, { erro: 'Endereço inválido.' }); }
  let f = path.join(base, p);
  if (f !== base && !f.startsWith(base + path.sep)) return json(res, 403, { erro: 'Acesso negado.' });
  fs.stat(f, (e, st) => {
    if (!e && st.isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e2, data) => {
      if (e2) return json(res, 404, { erro: 'Página não encontrada.' });
      res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(data);
    });
  });
}
const horariosOk = (arr) => Array.isArray(arr) && arr.length <= 24 && arr.every(horaValida);

async function rotear(req, res) {
  const url = new URL(req.url, 'http://x');
  const rota = url.pathname;
  const m = req.method;
  const ip = req.socket.remoteAddress;

  const ALIAS = { '/': '/login.html', '/dantes-pizza-e-bar': '/login.html', '/inicio': '/index.html' };
  const rotaArq = (m === 'GET' || m === 'HEAD') && ALIAS[rota] ? ALIAS[rota] : rota;
  if (rota === '/saude') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (rota === '/admin') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
  const api = rota.startsWith('/api/'), apiAdm = rota.startsWith('/admin/api/');
  if (apiAdm && !ADMIN_SENHA) throw erro(404, 'Rota não encontrada.');
  if (!api && !apiAdm) {
    if (m !== 'GET' && m !== 'HEAD') return json(res, 405, { erro: 'Método não permitido.' });
    return rota.startsWith('/admin/') ? estatico(res, ADMIN, rota.slice(6)) : estatico(res, PUBLIC, rotaArq);
  }
  let body = {};
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) throw erro(415, 'Tipo de pedido não aceito.');
    body = await lerCorpo(req);
  }

  /* ===== API DO CLIENTE ===== */
  if (api) {
    if (rota === '/api/conteudo' && m === 'GET') return json(res, 200, { ...conteudo, config: { maxPessoas: db.config.maxPessoas, diasMax: db.config.diasMax, confirmacaoAutomatica: db.config.confirmacaoAutomatica } });
    if (rota === '/api/fechados' && m === 'GET') {
      const hoje = agora().data;
      return json(res, 200, db.excecoes.filter((e) => e.fechado && e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).map((e) => ({ data: e.data, motivo: e.motivo })));
    }
    if (rota === '/api/login' && m === 'POST') {
      const nome = limpa(body.nome, 60), email = limpa(body.email, 120).toLowerCase();
      if (nome.length < 2) throw erro(400, 'Digite seu nome.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw erro(400, 'Digite um e-mail válido.');
      let u = db.usuarios.find((x) => x.email === email);
      if (u) u.nome = nome; else { u = { id: crypto.randomBytes(6).toString('hex'), nome, email, criadoEm: new Date().toISOString() }; db.usuarios.push(u); }
      salvar();
      return json(res, 200, { nome: u.nome, email: u.email }, { 'Set-Cookie': cookie('dantes_cli', assinar({ r: 'cli', id: u.id, exp: Date.now() + 90 * 86400e3 }), 90 * 86400) });
    }
    if (rota === '/api/logout' && m === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('dantes_cli', '', 0) });
    if (rota === '/api/disponibilidade' && m === 'GET') return json(res, 200, disponibilidade(url.searchParams.get('data') || ''));

    const u = clienteDe(req);
    if (!u) throw erro(401, 'Faça login para continuar.');
    if (rota === '/api/eu' && m === 'GET') return json(res, 200, { nome: u.nome, email: u.email });
    if (rota === '/api/reservas' && m === 'GET') return json(res, 200, db.reservas.filter((r) => r.usuarioId === u.id).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).map(publica));
    if (rota === '/api/reservas' && m === 'POST') return json(res, 201, publica(criarReserva(u, body)));
    const del = rota.match(/^\/api\/reservas\/([A-F0-9]+)$/);
    if (del && m === 'DELETE') {
      const r = db.reservas.find((x) => x.id === del[1] && x.usuarioId === u.id);
      if (!r) throw erro(404, 'Reserva não encontrada.');
      if (ATIVAS.includes(r.status)) { r.status = 'cancelada'; r.canceladaPor = 'cliente'; salvar(); }
      return json(res, 200, publica(r));
    }
    throw erro(404, 'Rota não encontrada.');
  }

  /* ===== API DO DONO ===== */
  if (rota === '/admin/api/login' && m === 'POST') {
    if (bloqueado(ip)) throw erro(429, 'Muitas tentativas. Espere 10 minutos.');
    if (!senhaOk(body.senha)) { falhou(ip); throw erro(401, 'Senha incorreta.'); }
    falhas.delete(ip);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('dantes_admin', assinar({ r: 'admin', exp: Date.now() + 12 * 3600e3 }), 12 * 3600) });
  }
  if (rota === '/admin/api/logout' && m === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('dantes_admin', '', 0) });
  if (!adminDe(req)) throw erro(401, 'Entre com a senha do painel.');

  if (rota === '/admin/api/eu') return json(res, 200, { ok: true });
  if (rota === '/admin/api/reservas' && m === 'GET') {
    const hoje = agora().data;
    const data = url.searchParams.get('data'), status = url.searchParams.get('status'), passadas = url.searchParams.get('passadas') === '1';
    let lista = db.reservas.filter((r) => (data ? r.data === data : passadas || r.data >= hoje) && (!status || r.status === status));
    lista = lista.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    const futuras = db.reservas.filter((r) => r.data >= hoje);
    return json(res, 200, {
      reservas: lista,
      resumo: {
        pendentes: futuras.filter((r) => r.status === 'pendente').length,
        hoje: futuras.filter((r) => r.data === hoje && ATIVAS.includes(r.status)).length,
        proximos7: futuras.filter((r) => r.data <= somaDias(hoje, 7) && ATIVAS.includes(r.status)).length
      }
    });
  }
  const pat = rota.match(/^\/admin\/api\/reservas\/([A-F0-9]+)$/);
  if (pat && m === 'PATCH') {
    const r = db.reservas.find((x) => x.id === pat[1]);
    if (!r) throw erro(404, 'Reserva não encontrada.');
    if (!['pendente', 'confirmada', 'recusada', 'cancelada'].includes(body.status)) throw erro(400, 'Status inválido.');
    if (ATIVAS.includes(body.status) && !ATIVAS.includes(r.status) && ocupadas(r.data, r.hora) >= db.config.mesasPorHorario) throw erro(409, 'Esse horário já está lotado.');
    r.status = body.status; if (body.status === 'cancelada') r.canceladaPor = 'casa';
    salvar(); return json(res, 200, r);
  }
  if (rota === '/admin/api/config' && m === 'GET') return json(res, 200, db.config);
  if (rota === '/admin/api/config' && m === 'PUT') {
    const c = body, n = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    if (!n(c.mesasPorHorario, 1, 200) || !n(c.maxPessoas, 1, 100) || !n(c.diasMax, 1, 365)) throw erro(400, 'Confira os números informados.');
    if (!Array.isArray(c.semana) || c.semana.length !== 7 || !c.semana.every((d) => horariosOk(d.horarios))) throw erro(400, 'Confira os horários da semana.');
    db.config = { mesasPorHorario: c.mesasPorHorario, maxPessoas: c.maxPessoas, diasMax: c.diasMax, confirmacaoAutomatica: !!c.confirmacaoAutomatica, semana: c.semana.map((d) => ({ aberto: !!d.aberto, horarios: [...new Set(d.horarios)].sort() })) };
    salvar(); return json(res, 200, db.config);
  }
  if (rota === '/admin/api/excecoes' && m === 'GET') {
    const hoje = agora().data;
    return json(res, 200, db.excecoes.filter((e) => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).map((e) => ({ ...e, reservasAtivas: db.reservas.filter((r) => r.data === e.data && ATIVAS.includes(r.status)).length })));
  }
  if (rota === '/admin/api/excecoes' && m === 'POST') {
    if (!dataValida(body.data)) throw erro(400, 'Escolha uma data válida.');
    const fechado = !!body.fechado, horarios = fechado ? [] : (body.horarios || []);
    if (!horariosOk(horarios)) throw erro(400, 'Confira os horários.');
    if (!fechado && !horarios.length) throw erro(400, 'Adicione ao menos um horário, ou marque o dia como fechado.');
    db.excecoes = db.excecoes.filter((e) => e.data !== body.data);
    db.excecoes.push({ data: body.data, fechado, motivo: limpa(body.motivo, 100), horarios: [...new Set(horarios)].sort() });
    let afetadas = 0;
    const ativas = db.reservas.filter((r) => r.data === body.data && ATIVAS.includes(r.status));
    if (fechado && body.cancelarReservas) { ativas.forEach((r) => { r.status = 'cancelada'; r.canceladaPor = 'casa'; }); afetadas = ativas.length; }
    else afetadas = fechado ? ativas.length : 0;
    salvar(); return json(res, 200, { ok: true, afetadas, canceladas: !!(fechado && body.cancelarReservas) });
  }
  const pex = rota.match(/^\/admin\/api\/excecoes\/(\d{4}-\d{2}-\d{2})$/);
  if (pex && m === 'DELETE') { db.excecoes = db.excecoes.filter((e) => e.data !== pex[1]); salvar(); return json(res, 200, { ok: true }); }
  throw erro(404, 'Rota não encontrada.');
}

carregar();
http.createServer((req, res) => {
  rotear(req, res).catch((e) => {
    if (!e.status) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { erro: e.status ? e.message : 'Erro interno no servidor.' });
  });
}).listen(PORT, () => {
  console.log(`\n  Dante's no ar!\n  Site do cliente: http://localhost:${PORT}/\n  Dados salvos em: ${DB_FILE}\n`);
});
