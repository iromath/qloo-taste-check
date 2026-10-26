(function () {
  var PALETTE = { LOVE: '#4ade80', MEH: '#facc15', PASS: '#94a3b8' };
  var VERDICTS = ['LOVE', 'MEH', 'PASS'];
  var state = { round: null, guesses: {} };

  var el = function (id) { return document.getElementById(id); };

  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }

  function fail(message) {
    var err = el('err');
    err.textContent = message;
    show(err);
    el('status').textContent = 'unavailable';
    el('status').className = 'pill warn';
  }

  async function getJson(url, options) {
    var res = await fetch(url, options);
    var body = await res.json().catch(function () { return null; });
    if (!res.ok) {
      var detail = body && body.error ? body.error.message : 'Request failed (' + res.status + ')';
      var hint = body && body.error && body.error.hint ? ' ' + body.error.hint : '';
      throw new Error(detail + hint);
    }
    return body;
  }

  function renderBoard(rows, me) {
    var board = el('board');
    board.innerHTML = '';
    if (!rows || rows.length === 0) {
      board.innerHTML = '<div class="empty">Nobody has scored yet.</div>';
      return;
    }
    rows.forEach(function (row, index) {
      var div = document.createElement('div');
      div.className = 'row' + (row.player === me ? ' me' : '');
      div.innerHTML =
        '<span class="rank">' + (index + 1) + '</span>' +
        '<span class="who">' + row.player + '</span>' +
        '<span class="pts">' + row.score + '</span>';
      board.appendChild(div);
    });
  }

  function renderCards(round) {
    var container = el('cards');
    container.innerHTML = '';
    round.candidates.forEach(function (candidate) {
      var card = document.createElement('div');
      card.className = 'card';
      var head = document.createElement('div');
      head.className = 'card-head';
      var name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = candidate.name;
      var meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.textContent = (candidate.subtitle || candidate.type || '').replace('urn:entity:', '');
      head.appendChild(name);
      head.appendChild(meta);
      card.appendChild(head);

      var picks = document.createElement('div');
      picks.className = 'picks';
      VERDICTS.forEach(function (verdict) {
        var button = document.createElement('button');
        button.className = 'pick';
        button.dataset.verdict = verdict;
        button.dataset.id = candidate.id;
        button.textContent = verdict;
        button.addEventListener('click', function () {
          state.guesses[candidate.id] = verdict;
          var siblings = picks.querySelectorAll('.pick');
          for (var i = 0; i < siblings.length; i += 1) siblings[i].classList.remove('on');
          button.classList.add('on');
          syncSubmit(round);
        });
        picks.appendChild(button);
      });
      card.appendChild(picks);
      container.appendChild(card);
    });
  }

  function syncSubmit(round) {
    var answered = round.candidates.filter(function (c) {
      return Boolean(state.guesses[c.id]);
    }).length;
    var button = el('submit');
    button.textContent = answered === round.candidates.length
      ? 'Submit answers'
      : 'Answer all ' + round.candidates.length + ' cards (' + answered + ')';
    if (answered === round.candidates.length) show(button); else hide(button);
  }

  function candidateFor(id) {
    var list = state.round && state.round.candidates ? state.round.candidates : [];
    for (var i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
    return null;
  }

  async function saveTaste(id, verdict, card) {
    var picks = card.querySelector('.taste-picks');
    var buttons = picks.querySelectorAll('.pick');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].disabled = true;
      buttons[i].classList.toggle('on', buttons[i].dataset.verdict === verdict);
    }
    try {
      await getJson('/api/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votes: [{ id: id, verdict: verdict }] })
      });
      card.querySelector('.taste-note').textContent = verdict === 'LOVE'
        ? 'Saved. Your For You ranking will pull towards this.'
        : 'Saved. This one will not seed your For You ranking.';
    } catch (error) {
      card.querySelector('.taste-note').textContent = error.message;
      for (var j = 0; j < buttons.length; j += 1) buttons[j].disabled = false;
    }
  }

  function renderReveal(result) {
    el('score').textContent = result.score;
    el('score-of').textContent = 'of ' + (result.total || result.answers.length);
    var container = el('reveal');
    container.innerHTML = '';
    result.answers.forEach(function (answer) {
      var candidate = candidateFor(answer.candidateId);
      var card = document.createElement('div');
      card.className = 'card';

      if (candidate) {
        var head = document.createElement('div');
        head.className = 'card-head';
        var name = document.createElement('div');
        name.className = 'card-name';
        name.textContent = candidate.name;
        var meta = document.createElement('div');
        meta.className = 'card-meta';
        meta.textContent = (candidate.subtitle || candidate.type || '').replace('urn:entity:', '');
        head.appendChild(name);
        head.appendChild(meta);
        card.appendChild(head);
      }

      var line = document.createElement('div');
      line.className = 'reveal';
      line.innerHTML =
        '<span class="tag ' + answer.verdict + '">' + answer.verdict + '</span>' +
        '<span class="tag ' + (answer.correct ? 'hit' : 'miss') + '">' + (answer.correct ? 'correct' : 'wrong') + '</span>' +
        '<b>Rank ' + answer.rank + ' / ' + answer.total + '</b>';
      card.appendChild(line);

      var reason = document.createElement('div');
      reason.className = 'reveal';
      reason.textContent = answer.reason;
      card.appendChild(reason);

      if (candidate) {
        var taste = document.createElement('div');
        taste.className = 'picks taste-picks';
        taste.style.gridTemplateColumns = '1fr 1fr';
        ['LOVE', 'PASS'].forEach(function (verdict) {
          var button = document.createElement('button');
          button.className = 'pick';
          button.dataset.verdict = verdict;
          button.textContent = verdict === 'LOVE' ? 'I love this' : 'Not for me';
          button.addEventListener('click', function () { saveTaste(candidate.id, verdict, card); });
          taste.appendChild(button);
        });
        card.appendChild(taste);

        var note = document.createElement('div');
        note.className = 'reveal taste-note';
        note.textContent = 'Tell Taste Check what you actually like — this feeds your For You ranking.';
        card.appendChild(note);
      }

      container.appendChild(card);
    });
    hide(el('board-view'));
    show(el('result-view'));
  }

  async function submit(round) {
    var button = el('submit');
    button.disabled = true;
    button.textContent = 'Grading…';
    try {
      var result = await getJson('/api/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: round.id, guesses: state.guesses }),
      });
      if (result.duplicate) {
        renderBoard(result.board ? result.board.top : [], result.board ? result.board.you && result.board.you.player : null);
        el('score').textContent = result.score;
        el('score-of').textContent = 'of ' + result.total;
        hide(el('board-view'));
        show(el('result-view'));
        el('reveal').innerHTML = '<div class="empty">You already played this round.</div>';
        return;
      }
      renderReveal(result);
      renderBoard(result.board ? result.board.top : [], result.board ? result.board.you && result.board.you.player : null);
      el('status').textContent = 'scored';
      el('status').className = 'pill ok';
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Retry';
      fail(error.message);
    }
  }

  async function load() {
    try {
      var data = await getJson('/api/round');
      var round = data.round;
      state.round = round;
      el('round-title').textContent = round.title;
      el('round-sub').textContent = round.candidates.length + ' cards built from this subreddit’s taste profile.';
      el('status').textContent = 'live';
      el('status').className = 'pill ok';

      if (data.played !== null && data.played !== undefined) {
        el('score').textContent = data.played;
        el('score-of').textContent = 'of ' + round.candidates.length;
        el('reveal').innerHTML = '<div class="empty">You already played this round. A new one lands daily.</div>';
        renderBoard(data.board.top, data.board.you && data.board.you.player);
        hide(el('board-view'));
        show(el('result-view'));
        return;
      }

      renderCards(round);
      syncSubmit(round);
      el('submit').addEventListener('click', function () { submit(round); });
      renderBoard(data.board.top, data.board.you && data.board.you.player);
    } catch (error) {
      fail(error.message);
      el('round-title').textContent = 'No round yet';
      el('round-sub').textContent = 'A moderator can start one from the subreddit menu.';
    }
  }

  load();
})();
