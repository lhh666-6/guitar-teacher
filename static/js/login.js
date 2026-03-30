document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabBtns = document.querySelectorAll('.tab-btn');

    function showMessage(form, msg, isError = true) {
        const msgDiv = form.querySelector('.message');
        msgDiv.textContent = msg;
        msgDiv.style.color = isError ? '#ff8888' : '#aaffaa';
        setTimeout(() => { msgDiv.textContent = ''; }, 3000);
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (target === 'login') {
                loginForm.style.display = 'block';
                registerForm.style.display = 'none';
            } else {
                loginForm.style.display = 'none';
                registerForm.style.display = 'block';
            }
        });
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = data.redirect || '/teach';
            } else {
                showMessage(loginForm, data.error || '登录失败');
            }
        } catch (err) {
            showMessage(loginForm, '网络错误，请重试');
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, confirm })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage(registerForm, '注册成功！请登录', false);
                setTimeout(() => {
                    document.querySelector('.tab-btn[data-tab="login"]').click();
                }, 1500);
            } else {
                showMessage(registerForm, data.error || '注册失败');
            }
        } catch (err) {
            showMessage(registerForm, '网络错误，请重试');
        }
    });
});