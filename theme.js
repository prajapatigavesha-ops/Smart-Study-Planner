const theme = localStorage.getItem('theme') || 'dark';
if (theme === 'dark') {
  document.documentElement.classList.add('dark');
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  if (document.documentElement.classList.contains('dark')) {
    localStorage.setItem('theme', 'dark');
  } else {
    localStorage.setItem('theme', 'light');
  }
  
  // Update Chart.js if on dashboard
  if (typeof Chart !== 'undefined' && typeof updateChart === 'function') {
    updateChart();
  }
}
