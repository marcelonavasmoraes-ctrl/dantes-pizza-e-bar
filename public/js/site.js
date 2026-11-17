(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- usuário (opcional: só é pedido ao reservar) ---------- */
  let user = Api.usuarioAtual();
  if (user) { try { user = await Api.eu(); } catch (e) { if (e.status === 401) { await Api.logout(); user = null; } } }

  function pintaUsuario() {
    $("#olaUser").textContent = user ? "Olá, " + user.nome.split(" ")[0] : "";
    $("#sair").hidden = !user;
    $("#entrar").hidden = !!user;
    $("#trava").hidden = !!user;
    $("#avisoLogin").hidden = !!user;
    $("#rNome").value = user ? user.nome : "";
    $("#rEmail").value = user ? user.email : "";
    $("#formReserva").querySelectorAll("input,select,textarea,button").forEach((el) => { el.tabIndex = user ? 0 : -1; });
  }

  /* ---------- topo ---------- */
  $("#burger").onclick = () => $("#menu").classList.toggle("aberto");
  document.querySelectorAll("#menu a").forEach((a) => a.addEventListener("click", () => $("#menu").classList.remove("aberto")));
  const topo = $("#topo");
  const onScroll = () => topo.classList.toggle("fundo", scrollY > 30);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  $("#ano").textContent = new Date().getFullYear();

  /* ---------- janela de login ---------- */
  const modal = $("#modal");
  let depoisDoLogin = null;
  function abrirLogin(acao) {
    depoisDoLogin = acao || null;
    $("#mErro").textContent = "";
    modal.hidden = false;
    setTimeout(() => $("#nome").focus(), 50);
  }
  const fecharLogin = () => { modal.hidden = true; depoisDoLogin = null; };
  $("#mFechar").onclick = fecharLogin;
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) fecharLogin(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) fecharLogin(); });

  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#mErro").textContent = "";
    try {
      user = await Api.login({ nome: $("#nome").value, email: $("#email").value });
      modal.hidden = true;
      pintaUsuario(); await carregarHorarios(); await listar();
      if (depoisDoLogin === "reservar") $("#reservar").scrollIntoView({ behavior: "smooth" });
      depoisDoLogin = null;
    } catch (err) { $("#mErro").textContent = err.message; }
  });

  /* todo botão "Reservar mesa": se não entrou, abre o login; se entrou, vai para a reserva */
  document.addEventListener("click", (e) => {
    const b = e.target.closest('a[href="#reservar"], [data-reservar]');
    if (!b) return;
    e.preventDefault();
    if (user) $("#reservar").scrollIntoView({ behavior: "smooth" });
    else abrirLogin("reservar");
  });
  $("#sair").onclick = async () => { await Api.logout(); user = null; pintaUsuario(); $("#listaRes").innerHTML = ""; $("#ok").classList.remove("on"); };

  /* ---------- informações ---------- */
  let info, cfg;
  try { info = await Api.getInfo(); cfg = await Api.getConfig(); }
  catch (e) { document.body.insertAdjacentHTML("afterbegin", `<p class="offline">${esc(e.message)}</p>`); return; }
  document.querySelectorAll("[data-info]").forEach((el) => {
    el.textContent = el.dataset.info.split(".").reduce((o, k) => o[k], info);
  });
  $("#lnkMapa").href = info.mapsLink;
  $("#lnkTel").href = "tel:+55" + info.telefone.replace(/\D/g, "");
  $("#lnkZap").href = "https://wa.me/" + info.whatsapp;
  $("#lnkInsta").href = info.instagram;
  $("#mapa").src = info.mapsEmbed;
  $("#taxa").innerHTML = "<b>" + esc(info.taxaServico) + "</b> Valores e itens podem mudar sem aviso.";
  $("#rodizioInclui").innerHTML = info.rodizio.inclui.split(" · ").map((t) => "<span>" + esc(t) + "</span>").join("");

  /* faixa que corre */
  const palavras = ["Pizzas", "Petiscos", "Panelinhas", "Churrasco na pedra", "Drinks", "Rodízio quarta e quinta"];
  const bloco = palavras.map((p) => "<span>" + p + "</span>").join("");
  $("#faixa").innerHTML = bloco + bloco + bloco + bloco;

  /* cardápio */
  const cardapio = await Api.getCardapio();
  $("#abas").innerHTML = cardapio.map((c, i) => `<button role="tab" data-id="${esc(c.id)}" class="${i === 0 ? "ativa" : ""}">${esc(c.titulo)}</button>`).join("");
  $("#paineis").innerHTML = cardapio.map((c, i) => `
    <div class="painel ${i === 0 ? "ativo" : ""}" id="p-${esc(c.id)}">
      ${c.nota ? `<p class="nota-tam">${esc(c.nota)}</p>` : ""}
      <div class="itens">${c.itens.map((it) => `
        <article class="item">
          <div class="linha"><h3>${esc(it.nome)}</h3><span class="pontos"></span><span class="valor ${/\D/.test(it.preco.replace(/[\d,.]/g, "")) ? "de" : ""}">${esc(it.preco)}</span></div>
          ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}
        </article>`).join("")}</div>
    </div>`).join("");
  $("#abas").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#abas button").forEach((x) => x.classList.toggle("ativa", x === b));
    document.querySelectorAll(".painel").forEach((p) => p.classList.toggle("ativo", p.id === "p-" + b.dataset.id));
  });

  /* galeria */
  const gal = await Api.getGaleria();
  $("#grade").innerHTML = gal.map((g, i) => `<figure class="fade" style="--d:${i * 0.1}s"><img src="${esc(g.src)}" alt="${esc(g.alt)}" loading="lazy"></figure>`).join("");
  observarFade($("#grade"));

  /* ---------- reserva: formulário ---------- */
  const hoje = new Date(); hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
  const iso = hoje.toISOString().slice(0, 10);
  $("#rData").min = iso; $("#rData").value = iso;
  $("#rPessoas").innerHTML = Array.from({ length: cfg.maxPessoas }, (_, i) => `<option value="${i + 1}" ${i === 1 ? "selected" : ""}>${i + 1} ${i ? "pessoas" : "pessoa"}</option>`).join("");

  const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const fmtCurto = (d) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  async function carregarHorarios() {
    const data = $("#rData").value, sel = $("#rHora"), btn = $("#rBtn"), av = $("#avisoFechado");
    av.classList.remove("on"); $("#avisoRodizio").classList.remove("on");
    if (!data) { sel.innerHTML = ""; btn.disabled = true; return; }
    let d;
    try { d = await Api.disponibilidade(data); }
    catch (e) { sel.innerHTML = ""; btn.disabled = true; av.textContent = e.message; av.classList.add("on"); return; }
    if ($("#rData").value !== data) return;
    if (!d.aberto) {
      sel.innerHTML = `<option value="">Sem horários</option>`; sel.disabled = true; btn.disabled = true;
      av.textContent = d.motivo; av.classList.add("on"); return;
    }
    const anterior = sel.value;
    sel.disabled = false; btn.disabled = false;
    sel.innerHTML = d.horarios.map((h) => `<option value="${esc(h.hora)}" ${h.vagas <= 0 ? "disabled" : ""}>${esc(h.hora)}${h.vagas <= 0 ? " · lotado" : h.vagas <= 2 ? " · últimas mesas" : ""}</option>`).join("");
    if ([...sel.options].some((o) => o.value === anterior && !o.disabled)) sel.value = anterior;
    else { const livre = [...sel.options].find((o) => !o.disabled); if (livre) sel.value = livre.value; else { btn.disabled = true; } }
    if (d.motivo) { av.textContent = d.motivo; av.classList.add("on"); }
    const dia = new Date(data + "T12:00:00").getDay();
    $("#avisoRodizio").classList.toggle("on", dia === 3 || dia === 4);
  }
  $("#rData").addEventListener("change", carregarHorarios);

  async function carregarFechados() {
    try {
      const f = await Api.getFechados();
      $("#fechados").innerHTML = f.length ? "<b>Dias fechados:</b> " + f.slice(0, 6).map((x) => `${fmtCurto(x.data)}${x.motivo ? " (" + esc(x.motivo) + ")" : ""}`).join(" · ") : "";
    } catch (e) {}
  }

  /* ---------- reserva: lista ---------- */
  const ROTULO = { pendente: "Aguardando confirmação", confirmada: "Confirmada", recusada: "Não foi possível", cancelada: "Cancelada" };
  async function listar() {
    if (!user) return;
    let rs; try { rs = await Api.listarReservas(); } catch (e) { if (e.status === 401) { await Api.logout(); user = null; pintaUsuario(); } return; }
    rs = rs.filter((r) => r.data >= iso || r.status === "pendente" || r.status === "confirmada");
    $("#listaRes").innerHTML = rs.length ? rs.map((r) => `
      <div class="res st-${esc(r.status)}"><div><strong>${esc(fmt(r.data))} · ${esc(r.hora)}</strong>
        <small>${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"}${r.obs ? " · " + esc(r.obs) : ""}</small>
        <span class="selo ${esc(r.status)}">${esc(ROTULO[r.status] || r.status)}</span></div>
      ${r.status === "pendente" || r.status === "confirmada" ? `<button data-id="${esc(r.id)}">Cancelar</button>` : ""}</div>`).join("")
      : `<p class="vazio">Você ainda não tem nenhuma reserva. Escolha o dia ao lado.</p>`;
  }
  $("#listaRes").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (!confirm("Cancelar essa reserva?")) return;
    try { await Api.cancelarReserva(b.dataset.id); } catch (err) { alert(err.message); }
    listar(); carregarHorarios();
  });

  $("#formReserva").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#rErro").textContent = "";
    if (!user) { abrirLogin("reservar"); return; }
    const btn = $("#rBtn"); btn.disabled = true;
    try {
      const r = await Api.criarReserva({ data: $("#rData").value, hora: $("#rHora").value, pessoas: $("#rPessoas").value, telefone: $("#rTel").value, obs: $("#rObs").value });
      const msg = encodeURIComponent(`Olá, Dante's! Sou ${user.nome} e fiz um pedido de reserva pelo site para ${r.pessoas} pessoa(s) em ${fmt(r.data)} às ${r.hora}. (Reserva ${r.id})`);
      const titulo = r.status === "confirmada" ? "Mesa reservada" : "Pedido enviado";
      const texto = r.status === "confirmada" ? "Sua reserva está confirmada." : "O Dante's vai confirmar sua mesa. O status aparece aqui ao lado.";
      $("#ok").innerHTML = `<h4>${titulo}, ${esc(user.nome.split(" ")[0])}!</h4><p>${esc(fmt(r.data))} às ${esc(r.hora)} · ${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"} · código ${esc(r.id)}<br>${texto}</p>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/${esc(info.whatsapp)}?text=${msg}">Avisar no WhatsApp</a>`;
      $("#ok").classList.add("on"); $("#rObs").value = "";
      listar();
    } catch (err) {
      if (err.status === 401) { await Api.logout(); user = null; pintaUsuario(); abrirLogin("reservar"); }
      else $("#rErro").textContent = err.message;
    }
    await carregarHorarios();
  });

  /* ---------- início ---------- */
  pintaUsuario();
  await carregarHorarios();
  carregarFechados();
  await listar();
  setInterval(listar, 30000);
})();
