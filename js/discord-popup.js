document.addEventListener('DOMContentLoaded', () => {
  try {
    const STORAGE_KEY = 'modex_discord_popup_hidden';

    if (typeof window !== 'undefined' && window.localStorage) {
      if (localStorage.getItem(STORAGE_KEY) === '1') {
        return;
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'modex-discord-popup';
    overlay.className =
      'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 px-4';

    const popup = document.createElement('div');
    popup.className =
      'bg-gray-900 border border-yellow-500/40 rounded-2xl max-w-sm w-full p-6 relative shadow-2xl';

    const closeBtn = document.createElement('button');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.className =
      'absolute top-3 right-3 text-gray-400 hover:text-white transition-colors';
    closeBtn.innerHTML = '<i class="fas fa-times text-xl"></i>';

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto mb-4 shadow-lg';
    iconWrap.innerHTML = '<i class="fab fa-discord text-3xl text-white"></i>';

    const title = document.createElement('h3');
    title.className = 'text-2xl font-bold text-center text-white mb-2';
    title.textContent = '¿Quieres unirte a nuestro Discord?';

    const text = document.createElement('p');
    text.className = 'text-sm text-gray-300 text-center mb-5';
    text.innerHTML =
      'En nuestro servidor regalamos <span class="text-yellow-400 font-semibold">diamantes</span>, ' +
      '<span class="text-yellow-400 font-semibold">sensibilidades</span> y compartimos configuraciones PRO para Free Fire.';

    const buttonsWrap = document.createElement('div');
    buttonsWrap.className = 'flex flex-col sm:flex-row gap-3 mt-2';

    const joinBtn = document.createElement('button');
    joinBtn.setAttribute('type', 'button');
    joinBtn.className =
      'flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg ' +
      'hover:from-indigo-400 hover:to-purple-400 transition-all flex items-center justify-center gap-2';
    joinBtn.innerHTML = '<i class="fab fa-discord"></i><span>Unirse</span>';

    const laterBtn = document.createElement('button');
    laterBtn.setAttribute('type', 'button');
    laterBtn.className =
      'flex-1 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white font-semibold py-2.5 rounded-lg transition-all';
    laterBtn.textContent = 'Ahora no';

    buttonsWrap.appendChild(joinBtn);
    buttonsWrap.appendChild(laterBtn);

    popup.appendChild(closeBtn);
    popup.appendChild(iconWrap);
    popup.appendChild(title);
    popup.appendChild(text);
    popup.appendChild(buttonsWrap);

    overlay.appendChild(popup);

    const showPopup = () => {
      // Evitar mostrar si por cualquier motivo ya se añadió
      if (!document.getElementById('modex-discord-popup')) {
        document.body.appendChild(overlay);
      }
    };

    const hidePopup = () => {
      try {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(STORAGE_KEY, '1');
        }
      } catch (e) {
        console.error('[ModeX Discord Popup] Error al ocultar popup:', e);
      }
    };

    closeBtn.addEventListener('click', hidePopup);
    laterBtn.addEventListener('click', hidePopup);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        hidePopup();
      }
    });

    joinBtn.addEventListener('click', () => {
      try {
        const url = 'https://discord.gg/modex';
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        console.error('[ModeX Discord Popup] Error al abrir Discord:', e);
      } finally {
        hidePopup();
      }
    });

    setTimeout(showPopup, 1800);
  } catch (e) {
    console.error('[ModeX Discord Popup] Error inicializando popup:', e);
  }
});


