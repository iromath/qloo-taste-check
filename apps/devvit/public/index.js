(function () {
  fetch('/api/round')
    .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
    .then(function (result) {
      var pill = document.getElementById('status');
      if (result.ok && result.body.round) {
        document.getElementById('title').textContent = result.body.round.title;
        document.getElementById('sub').textContent =
          result.body.round.candidates.length + ' cards ready · ' +
          (result.body.played === null || result.body.played === undefined ? 'not played yet' : 'you scored ' + result.body.played);
        pill.textContent = 'live';
        pill.className = 'pill ok';
      } else {
        document.getElementById('sub').textContent = 'No round has been created in this subreddit yet.';
        pill.textContent = 'no round';
        pill.className = 'pill warn';
      }
    })
    .catch(function () {
      var pill = document.getElementById('status');
      pill.textContent = 'offline';
      pill.className = 'pill warn';
    });
})();
