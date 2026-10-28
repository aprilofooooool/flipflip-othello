(function (Otc) {
  'use strict';
  // Pure functions are used from Node, so DOM access stays inside applyImage / renderCssDisc.

  function get(id) {
    var list = Otc.Characters;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) { return list[i]; }
    }
    return null;
  }

  function imagePath(char, name) {
    return char.image.dir + name + '.' + char.image.ext;
  }

  function imageCandidates(char, emotion) {
    var names = emotion === 'normal' ? ['normal'] : [emotion, 'normal'];
    return names.map(function (n) { return imagePath(char, n); });
  }

  function discCandidates(char) {
    var names = char.image.hasDisc ? ['disc', 'normal'] : ['normal'];
    return names.map(function (n) { return imagePath(char, n); });
  }

  function isSelectable(id, otherSelectedId) {
    return get(id) !== null && id !== otherSelectedId;
  }

  function pickCpu(excludeId, rng) {
    var random = rng || Math.random;
    var pool = Otc.Characters.filter(function (c) { return c.id !== excludeId; });
    var idx = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    return pool[idx];
  }

  // Theme-colored circle with the face for the emotion and the first letter of the name.
  function renderCssDisc(el, char, emotion) {
    var doc = el.ownerDocument;
    el.innerHTML = '';
    var disc = doc.createElement('div');
    disc.className = 'css-disc';
    disc.style.backgroundColor = char.colors.main;
    disc.style.borderColor = char.colors.sub;
    var face = doc.createElement('span');
    face.className = 'css-disc-face';
    face.textContent = char.face[emotion] || char.face.normal;
    var initial = doc.createElement('span');
    initial.className = 'css-disc-initial';
    initial.textContent = Array.from(char.name)[0];
    disc.appendChild(face);
    disc.appendChild(initial);
    el.appendChild(disc);
  }

  // Puts an <img> into el and walks the candidates on error; the CSS disc is the last resort.
  function applyImage(el, char, emotion, kind) {
    var candidates = kind === 'disc' ? discCandidates(char) : imageCandidates(char, emotion);
    var doc = el.ownerDocument;
    var img = doc.createElement('img');
    var i = 0;
    img.className = 'char-img';
    img.alt = char.name;
    img.onerror = function () {
      if (img.parentNode !== el) { return; } // replaced by a newer applyImage call
      i += 1;
      if (i < candidates.length) {
        img.src = candidates[i];
      } else {
        img.onerror = null;
        renderCssDisc(el, char, emotion);
      }
    };
    el.innerHTML = '';
    el.appendChild(img);
    img.src = candidates[0];
  }

  Otc.CharacterManager = {
    get: get,
    imagePath: imagePath,
    imageCandidates: imageCandidates,
    discCandidates: discCandidates,
    isSelectable: isSelectable,
    pickCpu: pickCpu,
    applyImage: applyImage,
    renderCssDisc: renderCssDisc
  };
})(window.Otc);
