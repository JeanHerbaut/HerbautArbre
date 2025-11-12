export function setupDialog(dialog) {
  if (!dialog) {
    throw new Error('Dialog element is required');
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });
  dialog.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => dialog.close());
  });
  return dialog;
}

export function openDialog(dialog) {
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function closeDialog(dialog) {
  if (dialog.open) {
    dialog.close();
  }
}
