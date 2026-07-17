const form = document.querySelector('#item-form');
const list = document.querySelector('#item-list');
const itemId = document.querySelector('#item-id');
const nameInput = document.querySelector('#name');
const descriptionInput = document.querySelector('#description');
const formTitle = document.querySelector('#form-title');
const saveButton = document.querySelector('#save-button');
const cancelButton = document.querySelector('#cancel-button');
const count = document.querySelector('#item-count');
const message = document.querySelector('#message');
const uploadForm = document.querySelector('#upload-form');
const uploadInput = document.querySelector('#file');
const uploadMessage = document.querySelector('#upload-message');
const fileList = document.querySelector('#file-list');

let items = [];

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function render() {
  count.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  list.innerHTML = items.length
    ? items.map((item) => `
      <article class="item">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.description || 'No description')}</p>
        </div>
        <div class="item-actions">
          <button class="secondary edit" data-id="${item.id}">Edit</button>
          <button class="danger delete" data-id="${item.id}">Delete</button>
        </div>
      </article>`).join('')
    : '<div class="empty">No items yet. Add your first one above.</div>';
}

async function loadItems() {
  const response = await fetch('/api/items');
  items = await response.json();
  render();
}

function resetForm() {
  form.reset();
  itemId.value = '';
  formTitle.textContent = 'Add an item';
  saveButton.textContent = 'Add item';
  cancelButton.hidden = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = itemId.value;
  const response = await fetch(id ? `/api/items/${id}` : '/api/items', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nameInput.value, description: descriptionInput.value }),
  });
  if (!response.ok) {
    const result = await response.json();
    message.textContent = result.error || 'Something went wrong';
    return;
  }
  message.textContent = id ? 'Item updated.' : 'Item added.';
  resetForm();
  await loadItems();
});

list.addEventListener('click', async (event) => {
  const id = event.target.dataset.id;
  if (!id) return;
  const item = items.find((entry) => entry.id === id);

  if (event.target.classList.contains('edit')) {
    itemId.value = item.id;
    nameInput.value = item.name;
    descriptionInput.value = item.description;
    formTitle.textContent = 'Edit item';
    saveButton.textContent = 'Save changes';
    cancelButton.hidden = false;
    nameInput.focus();
  }

  if (event.target.classList.contains('delete') && confirm(`Delete “${item.name}”?`)) {
    await fetch(`/api/items/${id}`, { method: 'DELETE' });
    message.textContent = 'Item deleted.';
    if (itemId.value === id) resetForm();
    await loadItems();
  }
});

cancelButton.addEventListener('click', resetForm);
loadItems().catch(() => { message.textContent = 'Could not load items.'; });

async function loadFiles() {
  const response = await fetch('/api/uploads');
  const files = await response.json();
  fileList.innerHTML = files.length
    ? files.map((file) => `
      <div class="file-row">
        <a href="${file.url}">${escapeHtml(file.filename)}</a>
        <span>${(file.size / 1024).toFixed(1)} KB</span>
        <button class="danger delete-file" data-filename="${escapeHtml(file.filename)}">Delete</button>
      </div>`).join('')
    : '<p class="hint">No uploaded files.</p>';
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData();
  data.append('file', uploadInput.files[0]);
  const response = await fetch('/api/uploads', { method: 'POST', body: data });
  const result = await response.json();
  uploadMessage.textContent = response.ok ? 'File uploaded.' : result.error;
  if (response.ok) {
    uploadForm.reset();
    await loadFiles();
  }
});

fileList.addEventListener('click', async (event) => {
  const filename = event.target.dataset.filename;
  if (!filename || !confirm('Delete this file?')) return;
  const response = await fetch(`/api/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  uploadMessage.textContent = response.ok ? 'File deleted.' : 'Could not delete file.';
  await loadFiles();
});

loadFiles().catch(() => { uploadMessage.textContent = 'Could not load files.'; });
