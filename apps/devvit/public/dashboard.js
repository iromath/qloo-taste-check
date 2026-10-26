(function () {
  var COLORS = { LOVE: '#4ade80', MEH: '#facc15', PASS: '#94a3b8' };
  var el = function (id) { return document.getElementById(id); };
  function show(node) { node.classList.remove('hidden'); }

  function fail(message) {
    el('err').textContent = message;
    show(el('err'));
    el('status').textContent = 'restricted';
    el('status').className = 'pill warn';
    el('sub').textContent = 'This page is visible to moderators only.';
  }

  function pct(value) { return Math.round(value * 100) + '%'; }

  function renderBoard(container, rows) {
    container.innerHTML = '';
    if (!rows || rows.length === 0) {
      container.innerHTML = '<div class="empty">No scores yet.</div>';
      return;
    }
    rows.forEach(function (row, index) {
      var div = document.createElement('div');
      div.className = 'row';
      div.innerHTML =
        '<span class="rank">' + (index + 1) + '</span>' +
        '<span class="who">' + row.player + '</span>' +
        '<span class="pts">' + row.score + ' · ' + row.rounds + 'r</span>';
      container.appendChild(div);
    });
  }

  async function load() {
    try {
      var res = await fetch('/api/dashboard');
      var body = await res.json().catch(function () { return null; });
      if (!res.ok) {
        throw new Error(body && body.error ? body.error.message : 'Request failed (' + res.status + ')');
      }

      el('k-rounds').textContent = body.rounds;
      el('k-votes').textContent = body.votes;
      el('k-acc').textContent = pct(body.accuracy);
      el('k-players').textContent = body.players;

      var total = body.verdictMix.reduce(function (sum, row) { return sum + row.count; }, 0);
      var mix = el('mix');
      mix.innerHTML = '';
      body.verdictMix.forEach(function (row) {
        var share = total === 0 ? 0 : row.count / total;
        var wrapper = document.createElement('div');
        wrapper.className = 'mix-row';
        wrapper.innerHTML =
          '<div class="lab"><span>' + row.verdict + '</span><span>' + row.count + '</span></div>' +
          '<div class="bar"><i style="width:' + Math.round(share * 100) + '%;background:' + COLORS[row.verdict] + '"></i></div>';
        mix.appendChild(wrapper);
      });

      var hardest = el('hardest');
      hardest.innerHTML = '';
      if (!body.hardest || body.hardest.length === 0) {
        hardest.innerHTML = '<div class="empty">No misses recorded yet.</div>';
      } else {
        body.hardest.forEach(function (row) {
          var div = document.createElement('div');
          div.className = 'row';
          div.innerHTML =
            '<span class="rank">' + row.misses + '</span>' +
            '<span class="who">' + row.name + '</span>' +
            '<span class="pts">' + (row.shown ? Math.round((row.misses / row.shown) * 100) : 0) + '% missed</span>';
          hardest.appendChild(div);
        });
      }

      renderBoard(el('board'), body.leaderboard);
      el('status').textContent = 'live';
      el('status').className = 'pill ok';
      show(el('view'));
    } catch (error) {
      fail(error.message);
    }
  }

  load();
})();
