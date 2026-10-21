import { buildProjectStarter, formatStarterTree, PROJECT_TYPES } from './project-starter-model.js';
import { buildContentZip } from './content-zip.js';

function init() {
  const find = id => document.getElementById(id);
  const tabs = [find('text-tree-tab'), find('project-starter-tab')];
  const panels = [find('text-tree-panel'), find('project-starter-panel')];
  const hashes = ['#text-tree', '#research-project-starter'];
  const activate = (index, updateUrl = false) => {
    tabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
      panels[position].hidden = position !== index;
    });
    if (updateUrl) history.replaceState(null, '', hashes[index]);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(index, true));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === undefined) return;
      event.preventDefault();
      activate(next, true);
      tabs[next].focus();
    });
  });
  const activateHash = () => activate(location.hash === hashes[1] ? 1 : 0);
  window.addEventListener('hashchange', activateHash);
  activateHash();

  const form = find('starter-form');
  const type = find('starter-type');
  const root = find('starter-root');
  const title = find('starter-title');
  const question = find('starter-question');
  const download = find('starter-download-button');
  const generated = find('starter-generated');
  const placeholder = find('starter-placeholder');
  const status = find('starter-status');
  const fileSelect = find('starter-file');
  const content = find('starter-content');
  let current = null;
  const updateTypeHelp = () => { find('starter-type-help').textContent = PROJECT_TYPES[type.value]?.description || 'Choose a project type.'; };
  const invalidate = () => {
    current = null;
    download.disabled = true;
    generated.hidden = true;
    placeholder.hidden = false;
    fileSelect.replaceChildren();
    content.textContent = '';
    find('starter-tree').textContent = '';
    find('starter-summary').textContent = '';
    status.dataset.error = 'false';
    status.textContent = 'Settings changed. Preview the updated starter before downloading.';
    updateTypeHelp();
  };
  for (const input of [type, root, title, question]) {
    input.addEventListener('input', invalidate);
    input.addEventListener('change', invalidate);
  }
  updateTypeHelp();
  const showFile = () => {
    const entry = current?.entries.find(item => !item.isDir && item.path === fileSelect.value);
    content.textContent = entry?.content || '';
  };
  fileSelect.addEventListener('change', showFile);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      current = buildProjectStarter({ projectType: type.value, rootName: root.value,
        title: title.value, question: question.value });
      find('starter-tree').textContent = formatStarterTree(current.entries);
      fileSelect.replaceChildren();
      for (const entry of current.entries.filter(item => !item.isDir)) {
        const option = document.createElement('option');
        option.value = entry.path;
        option.textContent = entry.path.slice(current.rootName.length + 1);
        fileSelect.append(option);
      }
      fileSelect.value = current.rootName + '/README.md';
      showFile();
      find('starter-summary').textContent = `${current.presetLabel} · ${current.folderCount} folders · ${current.fileCount} populated templates · NOT_RUN`;
      generated.hidden = false;
      placeholder.hidden = true;
      download.disabled = false;
      status.dataset.error = 'false';
      status.textContent = 'Starter ready for review. Registries have headers only; nothing has been executed.';
    } catch (error) {
      invalidate();
      status.dataset.error = 'true';
      status.textContent = error.message;
    }
  });
  download.addEventListener('click', () => {
    if (!current) return;
    try {
      const url = URL.createObjectURL(buildContentZip(current.entries));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${current.rootName}-starter.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.dataset.error = 'false';
      status.textContent = 'ZIP download requested. Extract into a new folder; review the checklist before any research run.';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error.message;
    }
  });
}

if (typeof document !== 'undefined') init();
