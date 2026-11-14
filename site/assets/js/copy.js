document.querySelectorAll('[data-copy]').forEach((b) => {
  b.addEventListener('click', async () => {
    const label = b.textContent;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = 'Copied!';
    } catch (e) {
      window.prompt('Copy this link:', b.dataset.copy);
    }
    setTimeout(() => (b.textContent = label), 1600);
  });
});
