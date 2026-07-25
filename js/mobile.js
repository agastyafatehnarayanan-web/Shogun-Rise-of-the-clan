/* =====================================================================
 * mobile.js — "Phone Version" of the existing strategy game.
 *
 * Layout only: adds/removes `body.phone`, which the CSS uses (together
 * with a max-width media query) to stack the map + panels, shrink the
 * top/bottom bars, and make modals full-screen. Auto-enables on small or
 * touch devices, remembers a manual choice, and exposes a toggle used by
 * the footer 📱 button and the title-screen "Phone Version" tile. Does not
 * touch game logic — the same campaign, reshaped to fit a phone.
 * ===================================================================== */
(function () {
  if (typeof document === "undefined") return;
  const KEY = "shogun_phone_layout";

  function apply(on) {
    document.body.classList.toggle("phone", !!on);
    const ft = document.getElementById("phone-toggle");
    if (ft) ft.classList.toggle("on", !!on);
    const tile = document.getElementById("phone-btn");
    if (tile) {
      tile.classList.toggle("on", !!on);
      const sub = tile.querySelector(".mt-sub");
      if (sub) sub.textContent = on
        ? "Phone layout is ON — the map & panels stack to fit your screen. Tap to switch back."
        : "The full strategy game, reshaped to play on a phone. Tap to turn the phone layout on.";
    }
  }

  const small = () => window.matchMedia && window.matchMedia("(max-width:820px)").matches;
  const coarse = () => window.matchMedia && window.matchMedia("(pointer:coarse)").matches;

  const PHONE = window.PHONE = {
    isOn() { return document.body.classList.contains("phone"); },
    set(on) { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {} apply(on); },
    toggle() { this.set(!this.isOn()); },
  };

  document.addEventListener("DOMContentLoaded", () => {
    let pref = null; try { pref = localStorage.getItem(KEY); } catch (e) {}
    apply(pref === "1" ? true : pref === "0" ? false : (small() || coarse()));

    const ft = document.getElementById("phone-toggle");
    if (ft) ft.onclick = () => PHONE.toggle();

    const tile = document.getElementById("phone-btn");
    if (tile) tile.onclick = () => PHONE.toggle();
  });
})();
