const theme = localStorage.getItem('theme');
if (theme === 'dark') {
  document.documentElement.classList.add('dark');
} else if (theme === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  // auto setup dark if system prefers
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
  if (typeof Chart !== 'undefined') {
    updateChart();
  }
}
