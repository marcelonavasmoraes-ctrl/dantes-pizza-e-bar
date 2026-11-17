/* Abertura em vídeo: toca uma vez por visita, depois o site aparece direto. */
(function () {
  const html = document.documentElement;
  if (!html.classList.contains("com-intro")) return;
  const box = document.getElementById("intro"), v = document.getElementById("introVideo"), pular = document.getElementById("introPular");
  let fim = false;
  function terminar() {
    if (fim) return; fim = true;
    try { sessionStorage.setItem("dantes_intro", "1"); } catch (e) {}
    box.classList.add("some");
    setTimeout(() => { html.classList.remove("com-intro"); try { v.pause(); } catch (e) {} }, 850);
  }
  pular.addEventListener("click", terminar);
  v.addEventListener("ended", terminar);
  v.addEventListener("error", terminar);
  addEventListener("keydown", (e) => { if (e.key === "Escape") terminar(); });
  const p = v.play();
  if (p && p.catch) p.catch(terminar);          // navegador bloqueou o vídeo: entra direto no site
  setTimeout(() => { if (!fim && v.readyState < 2) terminar(); }, 6000); // vídeo não carregou: não prende ninguém
})();
