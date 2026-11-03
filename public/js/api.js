/* ============================================================
   api.js — conversa com o servidor (server.js).
   Mesma interface do protótipo; agora os dados vêm do servidor
   e ficam salvos no arquivo dados/db.json.
   ============================================================ */
(function () {
  const K_USER = "dantes_usuario"; // só um "cache" para o site saber se já entrou
  const guarda = (u) => { try { u ? localStorage.setItem(K_USER, JSON.stringify(u)) : localStorage.removeItem(K_USER); } catch (e) {} };

  async function req(metodo, url, corpo) {
    let r;
    try {
      r = await fetch(url, { method: metodo, credentials: "same-origin", headers: corpo ? { "Content-Type": "application/json" } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    } catch (e) { throw Object.assign(new Error("Sem conexão com o servidor. Confira se ele está ligado."), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(j.erro || "Algo deu errado. Tente de novo."), { status: r.status });
    return j;
  }
  let _conteudo;
  const conteudo = () => _conteudo || (_conteudo = req("GET", "/api/conteudo").catch((e) => { _conteudo = null; throw e; }));

  window.Api = {
    getInfo: async () => (await conteudo()).info,
    getCardapio: async () => (await conteudo()).cardapio,
    getGaleria: async () => (await conteudo()).galeria,
    getConfig: async () => (await conteudo()).config,
    getFechados: () => req("GET", "/api/fechados"),
    disponibilidade: (data) => req("GET", "/api/disponibilidade?data=" + encodeURIComponent(data)),

    usuarioAtual() { try { return JSON.parse(localStorage.getItem(K_USER)); } catch (e) { return null; } },
    async eu() { const u = await req("GET", "/api/eu"); guarda(u); return u; },
    async login({ nome, email }) { const u = await req("POST", "/api/login", { nome, email }); guarda(u); return u; },
    async logout() { guarda(null); try { await req("POST", "/api/logout", {}); } catch (e) {} return true; },

    listarReservas: () => req("GET", "/api/reservas"),
    criarReserva: (d) => req("POST", "/api/reservas", d),
    cancelarReserva: (id) => req("DELETE", "/api/reservas/" + encodeURIComponent(id))
  };
})();
