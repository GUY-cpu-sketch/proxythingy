const form = document.getElementById('registerForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      alert('Registration successful!');
      window.location.href = '/chat'; // redirect to chat
    } else {
      alert('Registration failed: ' + data.error);
    }
  } catch (err) {
    console.error(err);
    alert('An error occurred.');
  }
});
