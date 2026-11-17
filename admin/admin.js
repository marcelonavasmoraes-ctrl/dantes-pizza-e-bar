(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const ST = { pendente: "Aguardando", confirmada: "Confirmada", recusada: "Recusada", cancelada: "Cancelada" };

  async function api(m, u, b) {
    let r;
    try { r = await fetch(u, { method: m, credentials: "same-origin", headers: b ? { "Content-Type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined }); }
    catch (e) { throw Object.assign(new Error("Sem conexão com o servidor."), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(j.erro || "Erro."), { status: r.status });
    return j;
  }
  const fmtData = (d) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  let toastT;
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 4000); }

  /* editor de horários (bolinhas com ×) */
  function chips(el, inicial) {
    let lista = [...inicial].sort();
    el.classList.add("chips");
    function desenha() {
      el.innerHTML = "";
      lista.forEach((h) => {
        const s = document.createElement("span"); s.className = "chip"; s.textContent = h;
        const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Remover " + h);
        x.onclick = () => { lista = lista.filter((v) => v !== h); desenha(); };
        s.appendChild(x); el.appendChild(s);
      });
      const t = document.createElement("input"); t.type = "time";
      const a = document.createElement("button"); a.type = "button"; a.className = "mini"; a.textContent = "+ horário";
      a.onclick = () => { if (t.value && !lista.includes(t.value)) { lista.push(t.value); lista.sort(); desenha(); } };
      el.append(t, a);
    }
    desenha();
    return { get: () => [...lista], set: (l) => { lista = [...l].sort(); desenha(); } };
  }

  /* ---------- entrada ---------- */
  async function iniciar() {
    try { await api("GET", "/admin/api/eu"); mostrarApp(); }
    catch (e) { $("#telaLogin").hidden = false; $("#app").hidden = true; }
  }
  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#erroLogin").textContent = "";
    try { await api("POST", "/admin/api/login", { senha: $("#senha").value }); $("#senha").value = ""; mostrarApp(); }
    catch (err) { $("#erroLogin").textContent = err.message; }
  });
  $("#sair").onclick = async () => { await api("POST", "/admin/api/logout", {}); location.reload(); };

  let pendAnterior = null, timer;
  function mostrarApp() {
    $("#telaLogin").hidden = true; $("#app").hidden = false;
    carregarReservas(); carregarDias(); carregarFunc();
    clearInterval(timer); timer = setInterval(() => { if (!$("#aba-reservas").hidden) carregarReservas(); }, 15000);
  }
  function sessaoExpirou(e) { if (e.status === 401) { $("#app").hidden = true; $("#telaLogin").hidden = false; return true; } return false; }

  $("#abasAdm").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#abasAdm button").forEach((x) => x.classList.toggle("ativa", x === b));
    ["reservas", "dias", "func"].forEach((a) => ($("#aba-" + a).hidden = a !== b.dataset.aba));
    if (b.dataset.aba === "reservas") carregarReservas();
  });

  /* ---------- reservas ---------- */
  async function carregarReservas() {
    const q = new URLSearchParams();
    if ($("#fData").value) q.set("data", $("#fData").value);
    if ($("#fStatus").value) q.set("status", $("#fStatus").value);
    if ($("#fPassadas").checked) q.set("passadas", "1");
    let d;
    try { d = await api("GET", "/admin/api/reservas?" + q); } catch (e) { if (!sessaoExpirou(e)) toast(e.message); return; }
    $("#rsPend").textContent = d.resumo.pendentes; $("#rsHoje").textContent = d.resumo.hoje; $("#rs7").textContent = d.resumo.proximos7;
    const bd = $("#badge"); bd.hidden = !d.resumo.pendentes; bd.textContent = d.resumo.pendentes;
    document.title = (d.resumo.pendentes ? `(${d.resumo.pendentes}) ` : "") + "Painel — Dante's";
    if (pendAnterior !== null && d.resumo.pendentes > pendAnterior) toast("Nova reserva chegou!");
    pendAnterior = d.resumo.pendentes;

    if (!d.reservas.length) { $("#listaRes").innerHTML = `<p class="lista-vazia">Nenhuma reserva encontrada com esses filtros.</p>`; return; }
    const grupos = {};
    d.reservas.forEach((r) => (grupos[r.data] = grupos[r.data] || []).push(r));
    $("#listaRes").innerHTML = Object.keys(grupos).sort().map((dia) => {
      const ativas = grupos[dia].filter((r) => r.status === "pendente" || r.status === "confirmada");
      return `<div class="dia-grupo">${esc(fmtData(dia))}<small>${ativas.length} ${ativas.length === 1 ? "reserva ativa" : "reservas ativas"} · ${ativas.reduce((s, r) => s + r.pessoas, 0)} pessoas</small></div>` +
        grupos[dia].map((r) => {
          const tel = r.telefone ? ` · <a target="_blank" rel="noopener" href="https://wa.me/55${esc(r.telefone.replace(/\D/g, ""))}">${esc(r.telefone)}</a>` : "";
          const botoes = [];
          if (r.status !== "confirmada") botoes.push(`<button class="mini sim" data-id="${esc(r.id)}" data-st="confirmada">Confirmar</button>`);
          if (r.status === "pendente") botoes.push(`<button class="mini" data-id="${esc(r.id)}" data-st="recusada">Recusar</button>`);
          if (r.status === "confirmada") botoes.push(`<button class="mini" data-id="${esc(r.id)}" data-st="cancelada">Cancelar</button>`);
          return `<div class="r st-${esc(r.status)} ${r.status === "pendente" ? "novo" : ""}">
            <div class="hora">${esc(r.hora)}</div>
            <div><div class="nome">${esc(r.nome)} · ${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"} <span class="selo ${esc(r.status)}">${esc(ST[r.status])}${r.canceladaPor === "cliente" ? " pelo cliente" : ""}</span></div>
              <div class="det">${esc(r.email)}${tel}${r.obs ? "<br>“" + esc(r.obs) + "”" : ""}</div></div>
            <div class="acoes">${botoes.join("")}</div></div>`;
        }).join("");
    }).join("");
  }
  $("#listaRes").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-id]"); if (!b) return;
    if (b.dataset.st !== "confirmada" && !confirm(b.dataset.st === "recusada" ? "Recusar esse pedido?" : "Cancelar essa reserva?")) return;
    try { await api("PATCH", "/admin/api/reservas/" + b.dataset.id, { status: b.dataset.st }); } catch (err) { toast(err.message); }
    carregarReservas();
  });
  ["fData", "fStatus", "fPassadas"].forEach((id) => $("#" + id).addEventListener("change", carregarReservas));
  $("#fLimpar").onclick = () => { $("#fData").value = ""; $("#fStatus").value = ""; $("#fPassadas").checked = false; carregarReservas(); };

  /* ---------- dias especiais ---------- */
  const dChips = chips($("#dChips"), ["19:00", "20:00", "21:00"]);
  const hoje = new Date(); hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
  $("#dData").min = hoje.toISOString().slice(0, 10);
  function tipoDia() { const f = $("#dTipo").value === "fechado"; $("#dHorBox").hidden = f; $("#dCancelBox").hidden = !f; }
  $("#dTipo").addEventListener("change", tipoDia); tipoDia();

  $("#formDia").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#dErro").textContent = "";
    const fechado = $("#dTipo").value === "fechado";
    try {
      const r = await api("POST", "/admin/api/excecoes", { data: $("#dData").value, fechado, motivo: $("#dMotivo").value, horarios: fechado ? [] : dChips.get(), cancelarReservas: fechado && $("#dCancelar").checked });
      toast(r.canceladas ? `Dia salvo. ${r.afetadas} reserva(s) cancelada(s).` : r.afetadas ? `Dia fechado. Atenção: já havia ${r.afetadas} reserva(s) nesse dia.` : "Dia salvo.");
      $("#dMotivo").value = ""; $("#dCancelar").checked = false;
      carregarDias(); carregarReservas();
    } catch (err) { $("#dErro").textContent = err.message; }
  });
  async function carregarDias() {
    let l; try { l = await api("GET", "/admin/api/excecoes"); } catch (e) { return; }
    $("#listaDias").innerHTML = l.length ? l.map((x) => `
      <div class="exc"><div><b>${esc(fmtData(x.data))}</b>${x.fechado ? `<span class="tag">Fechado</span>` : `<span class="tag esp">Horários: ${esc(x.horarios.join(", "))}</span>`}
        <small>${esc(x.motivo || "Sem motivo informado")}${x.fechado && x.reservasAtivas ? ` · ${x.reservasAtivas} reserva(s) ativa(s) nesse dia` : ""}</small></div>
        <button class="mini" data-del="${esc(x.data)}">Remover</button></div>`).join("")
      : `<p class="lista-vazia">Nenhum dia especial cadastrado.</p>`;
  }
  $("#listaDias").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-del]"); if (!b) return;
    if (!confirm("Remover esse dia especial? O dia volta a seguir o horário normal da semana.")) return;
    await api("DELETE", "/admin/api/excecoes/" + b.dataset.del); carregarDias();
  });

  /* ---------- funcionamento ---------- */
  const semanaEd = [];
  async function carregarFunc() {
    let c; try { c = await api("GET", "/admin/api/config"); } catch (e) { return; }
    $("#semana").innerHTML = "";
    DIAS.forEach((nome, i) => {
      const row = document.createElement("div"); row.className = "dsem" + (c.semana[i].aberto ? "" : " fechada");
      row.innerHTML = `<label class="campo chk"><input type="checkbox" ${c.semana[i].aberto ? "checked" : ""}> <span><b>${nome}</b></span></label><div class="ch"></div>`;
      const ed = chips(row.querySelector(".ch"), c.semana[i].horarios);
      row.querySelector("input").addEventListener("change", (e) => row.classList.toggle("fechada", !e.target.checked));
      $("#semana").appendChild(row); semanaEd[i] = { row, ed };
    });
    $("#cMesas").value = c.mesasPorHorario; $("#cPessoas").value = c.maxPessoas; $("#cDias").value = c.diasMax; $("#cAuto").checked = c.confirmacaoAutomatica;
  }
  $("#formFunc").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#cErro").textContent = "";
    try {
      await api("PUT", "/admin/api/config", {
        mesasPorHorario: parseInt($("#cMesas").value, 10), maxPessoas: parseInt($("#cPessoas").value, 10), diasMax: parseInt($("#cDias").value, 10), confirmacaoAutomatica: $("#cAuto").checked,
        semana: semanaEd.map((s) => ({ aberto: s.row.querySelector("input").checked, horarios: s.ed.get() }))
      });
      toast("Funcionamento salvo.");
    } catch (err) { $("#cErro").textContent = err.message; }
  });

  iniciar();
})();
