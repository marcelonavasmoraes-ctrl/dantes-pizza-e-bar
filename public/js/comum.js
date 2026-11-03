/* Efeitos comuns: fade na página, fade in/out ao rolar */
function irPara(url) {
  document.body.classList.add("saindo");
  setTimeout(() => (location.href = url), 330);
}

window.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => document.body.classList.add("pronto"));
  observarFade();
});

let _obs;
function observarFade(raiz = document) {
  if (!("IntersectionObserver" in window)) { raiz.querySelectorAll(".fade").forEach((e) => e.classList.add("in")); return; }
  _obs = _obs || new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      const el = en.target;
      if (en.isIntersecting) { el.classList.remove("out"); el.classList.add("in"); }
      else if (en.boundingClientRect.top < 0) { el.classList.remove("in"); el.classList.add("out"); } // saiu por cima: fade out
      else { el.classList.remove("in", "out"); }                                                        // ainda vai aparecer
    });
  }, { threshold: 0.12 });
  raiz.querySelectorAll(".fade").forEach((e) => _obs.observe(e));
}
