'use strict';

(function startupWindow() {
  const api = window.startup;
  const $ = (id) => document.getElementById(id);
  const sections = ['progress', 'first-run', 'error'];
  let steps = [];
  let loaded = false;
  const queued = [];

  function show(id) {
    for (const name of sections) $(name).hidden = name !== id;
  }

  function renderSteps() {
    const list = $('steps');
    list.replaceChildren(...steps.map((step) => {
      const item = document.createElement('li');
      item.className = step.status || '';
      const dot = document.createElement('span');
      dot.className = 'dot';
      const label = document.createElement('span');
      label.textContent = step.label;
      item.append(dot, label);
      return item;
    }));
  }

  function setStep(id, status) {
    steps = steps.map((step) => (step.id === id ? { ...step, status } : step));
    renderSteps();
  }

  function showError(event) {
    $('error-message').textContent = event.message;
    $('error-hint').textContent = event.hint || 'Try again. If it keeps failing, open the logs folder and attach desktop.log to an issue.';
    const output = $('error-output');
    output.hidden = !event.output || event.output.length === 0;
    output.textContent = (event.output || []).join('\n');
    $('error-log').textContent = event.logPath ? `Log file: ${event.logPath}` : '';
    show('error');
  }

  function handle(event) {
    if (event.type === 'reset') {
      steps = steps.map((step) => ({ ...step, status: '' }));
      renderSteps();
      show('progress');
    } else if (event.type === 'step') {
      setStep(event.id, event.status);
    } else if (event.type === 'first-run') {
      $('admin-email').textContent = event.email;
      $('admin-password').textContent = event.password;
      show('first-run');
    } else if (event.type === 'error') {
      showError(event);
    }
  }

  // Events can arrive before the step list loads; replay them afterwards.
  api.onEvent((event) => {
    if (loaded) handle(event);
    else queued.push(event);
  });

  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', () => {
      api.copy(button.dataset.copy);
      const original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = original; }, 1200);
    });
  }
  $('continue').addEventListener('click', () => api.continue());
  $('retry').addEventListener('click', () => api.retry());
  $('open-logs').addEventListener('click', () => api.openLogs());
  $('quit').addEventListener('click', () => api.quit());

  api.info().then((info) => {
    if (!info) return;
    $('version').textContent = `Version ${info.version}`;
    steps = info.steps.map((step) => ({ ...step, status: '' }));
    renderSteps();
    loaded = true;
    queued.splice(0).forEach(handle);
  });
}());
