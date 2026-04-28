document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const sendCodeBtn = document.getElementById('send-code-btn');

    function showMessage(form, msg, isError = true) {
        const msgDiv = form.querySelector('.message');
        msgDiv.textContent = msg;
        msgDiv.style.color = isError ? '#ff8888' : '#aaffaa';
        setTimeout(() => { msgDiv.textContent = ''; }, 5000);
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

    // 发送验证码
    let countdownTimer = null;
    sendCodeBtn.addEventListener('click', async () => {
        const email = document.getElementById('reg-email').value.trim();
        if (!email) {
            showMessage(registerForm, '请先输入邮箱');
            return;
        }

        sendCodeBtn.disabled = true;

        try {
            const res = await fetch('/api/send_verify_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage(registerForm, '验证码已发送，请查收邮件', false);
                startCountdown();
            } else {
                showMessage(registerForm, data.error || '发送失败');
                sendCodeBtn.disabled = false;
            }
        } catch (err) {
            showMessage(registerForm, '网络错误，请重试');
            sendCodeBtn.disabled = false;
        }
    });

    function startCountdown() {
        let seconds = 60;
        sendCodeBtn.textContent = seconds + 's';
        countdownTimer = setInterval(() => {
            seconds--;
            sendCodeBtn.textContent = seconds + 's';
            if (seconds <= 0) {
                clearInterval(countdownTimer);
                sendCodeBtn.textContent = '重新发送';
                sendCodeBtn.disabled = false;
            }
        }, 1000);
    }

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
        const verifyCode = document.getElementById('reg-verify-code').value;
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, confirm, verify_code: verifyCode })
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