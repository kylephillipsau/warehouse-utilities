/*
 * Forklift Licence Practice Test — quiz engine.
 * Vanilla JS, no dependencies. Reads questions from FORKLIFT_QUESTIONS.
 */
(function () {
  "use strict";

  var EXAM_LENGTH = 20;      // number of questions in an exam attempt
  var PASS_PERCENT = 80;     // pass mark for the exam
  var EXAM_MINUTES = 20;     // time limit for the exam mode

  var state = {
    mode: "practice",        // "practice" | "exam"
    category: "all",
    questions: [],           // the working set for this attempt (each with shuffled options)
    current: 0,
    answers: [],             // selected option index per question (null if unanswered)
    revealed: [],            // practice mode: has this question's answer been shown
    timerId: null,
    endTime: 0
  };

  // ---- helpers -------------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Build a working copy of a question with its options shuffled while
  // keeping track of which shuffled index is the correct one.
  function prepareQuestion(q) {
    var indexed = q.options.map(function (text, i) { return { text: text, orig: i }; });
    var shuffled = shuffle(indexed);
    return {
      category: q.category,
      question: q.question,
      options: shuffled.map(function (o) { return o.text; }),
      answer: shuffled.findIndex(function (o) { return o.orig === q.answer; }),
      explanation: q.explanation
    };
  }

  function categories() {
    var seen = {};
    FORKLIFT_QUESTIONS.forEach(function (q) { seen[q.category] = true; });
    return Object.keys(seen);
  }

  // ---- setup screen --------------------------------------------------------

  function buildStartScreen() {
    var sel = $("categorySelect");
    sel.innerHTML = "";
    var optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = "All topics (" + FORKLIFT_QUESTIONS.length + " questions)";
    sel.appendChild(optAll);
    categories().forEach(function (c) {
      var count = FORKLIFT_QUESTIONS.filter(function (q) { return q.category === c; }).length;
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c + " (" + count + ")";
      sel.appendChild(o);
    });
  }

  function startAttempt() {
    state.mode = document.querySelector('input[name="mode"]:checked').value;
    state.category = $("categorySelect").value;

    var pool = FORKLIFT_QUESTIONS.filter(function (q) {
      return state.category === "all" || q.category === state.category;
    });
    pool = shuffle(pool);

    if (state.mode === "exam") {
      pool = pool.slice(0, Math.min(EXAM_LENGTH, pool.length));
    }

    state.questions = pool.map(prepareQuestion);
    state.current = 0;
    state.answers = state.questions.map(function () { return null; });
    state.revealed = state.questions.map(function () { return false; });

    show("quiz");
    if (state.mode === "exam") {
      startTimer();
    } else {
      $("timer").textContent = "";
    }
    renderQuestion();
  }

  // ---- timer (exam mode) ---------------------------------------------------

  function startTimer() {
    state.endTime = Date.now() + EXAM_MINUTES * 60 * 1000;
    tick();
    state.timerId = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function tick() {
    var remaining = Math.max(0, state.endTime - Date.now());
    var m = Math.floor(remaining / 60000);
    var s = Math.floor((remaining % 60000) / 1000);
    $("timer").textContent = "Time: " + m + ":" + (s < 10 ? "0" : "") + s;
    if (remaining <= 0) {
      stopTimer();
      finish();
    }
  }

  // ---- question rendering --------------------------------------------------

  function renderQuestion() {
    var q = state.questions[state.current];
    var total = state.questions.length;

    $("progressText").textContent = "Question " + (state.current + 1) + " of " + total;
    $("progressBar").style.width = ((state.current) / total * 100) + "%";
    $("questionCategory").textContent = q.category;
    $("questionText").textContent = q.question;

    var revealed = state.mode === "practice" && state.revealed[state.current];
    var chosen = state.answers[state.current];

    var list = $("options");
    list.innerHTML = "";
    q.options.forEach(function (text, i) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.textContent = text;

      if (chosen === i) { btn.classList.add("selected"); }

      if (revealed) {
        btn.disabled = true;
        if (i === q.answer) { btn.classList.add("correct"); }
        else if (chosen === i) { btn.classList.add("incorrect"); }
      }

      btn.addEventListener("click", function () { selectOption(i); });
      li.appendChild(btn);
      list.appendChild(li);
    });

    // Explanation (practice mode, after answering)
    var exp = $("explanation");
    if (revealed) {
      var correctText = q.options[q.answer];
      var wasRight = chosen === q.answer;
      exp.className = "explanation " + (wasRight ? "right" : "wrong");
      exp.innerHTML =
        "<strong>" + (wasRight ? "Correct." : "Not quite.") + "</strong> " +
        (wasRight ? "" : "The correct answer is: <em>" + escapeHtml(correctText) + "</em>. ") +
        escapeHtml(q.explanation);
      exp.style.display = "block";
    } else {
      exp.style.display = "none";
      exp.textContent = "";
    }

    // Buttons
    $("prevBtn").disabled = state.current === 0;
    var isLast = state.current === total - 1;
    $("nextBtn").textContent = isLast ? "Finish" : "Next";
    // In practice mode, first click on an unanswered question reveals the answer.
    $("nextBtn").disabled = false;
  }

  function selectOption(i) {
    if (state.mode === "practice" && state.revealed[state.current]) { return; }
    state.answers[state.current] = i;
    if (state.mode === "practice") {
      state.revealed[state.current] = true;
    }
    renderQuestion();
  }

  function next() {
    var total = state.questions.length;
    // Practice mode: if not yet revealed and unanswered, nudge to answer first.
    if (state.mode === "practice" && !state.revealed[state.current] && state.answers[state.current] === null) {
      flash("Select an answer to see the explanation, or use Skip.");
      return;
    }
    if (state.current < total - 1) {
      state.current++;
      renderQuestion();
    } else {
      finish();
    }
  }

  function prev() {
    if (state.current > 0) {
      state.current--;
      renderQuestion();
    }
  }

  function skip() {
    var total = state.questions.length;
    if (state.current < total - 1) {
      state.current++;
      renderQuestion();
    } else {
      finish();
    }
  }

  // ---- results -------------------------------------------------------------

  function finish() {
    stopTimer();
    var total = state.questions.length;
    var correct = 0;
    state.questions.forEach(function (q, i) {
      if (state.answers[i] === q.answer) { correct++; }
    });
    var pct = total ? Math.round(correct / total * 100) : 0;
    var passed = pct >= PASS_PERCENT;

    show("results");

    $("scoreLine").textContent = correct + " / " + total + " correct (" + pct + "%)";
    var verdict = $("verdict");
    if (state.mode === "exam") {
      verdict.textContent = passed ? "PASS" : "FAIL";
      verdict.className = "verdict " + (passed ? "pass" : "fail");
      $("verdictNote").textContent = "Exam pass mark is " + PASS_PERCENT + "%. " +
        (passed ? "Great work — keep revising the topics you missed." :
                  "Review the questions below and try again.");
    } else {
      verdict.textContent = "Practice complete";
      verdict.className = "verdict neutral";
      $("verdictNote").textContent = "Review any questions you missed below.";
    }

    // Build review list
    var review = $("review");
    review.innerHTML = "";
    state.questions.forEach(function (q, i) {
      var chosen = state.answers[i];
      var right = chosen === q.answer;

      var item = document.createElement("div");
      item.className = "review-item " + (right ? "right" : "wrong");

      var head = document.createElement("div");
      head.className = "review-q";
      head.textContent = (i + 1) + ". " + q.question;
      item.appendChild(head);

      var yours = document.createElement("div");
      yours.className = "review-line";
      yours.innerHTML = "<span class='tag'>Your answer:</span> " +
        (chosen === null ? "<em>(not answered)</em>" : escapeHtml(q.options[chosen]));
      item.appendChild(yours);

      if (!right) {
        var ans = document.createElement("div");
        ans.className = "review-line";
        ans.innerHTML = "<span class='tag'>Correct:</span> " + escapeHtml(q.options[q.answer]);
        item.appendChild(ans);
      }

      var why = document.createElement("div");
      why.className = "review-exp";
      why.textContent = q.explanation;
      item.appendChild(why);

      review.appendChild(item);
    });

    window.scrollTo(0, 0);
  }

  // ---- screen switching ----------------------------------------------------

  function show(name) {
    ["start", "quiz", "results"].forEach(function (s) {
      $("screen-" + s).style.display = (s === name) ? "block" : "none";
    });
  }

  function flash(msg) {
    var el = $("flash");
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el.style.display = "none"; }, 2500);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- wire up -------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", function () {
    buildStartScreen();
    $("startBtn").addEventListener("click", startAttempt);
    $("nextBtn").addEventListener("click", next);
    $("prevBtn").addEventListener("click", prev);
    $("skipBtn").addEventListener("click", skip);
    $("quitBtn").addEventListener("click", function () { stopTimer(); show("start"); });
    $("restartBtn").addEventListener("click", function () { show("start"); });
    $("retryBtn").addEventListener("click", startAttempt);
    show("start");
  });
})();
