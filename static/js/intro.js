/**
 * 开场动画 - 使用 GSAP
 */
document.addEventListener('DOMContentLoaded', () => {
    // 获取元素
    const overlay = document.getElementById('intro-overlay');
    const guitar = document.getElementById('intro-guitar');
    const girl = document.getElementById('intro-girl');
    const mainContent = document.querySelector('.main-content');

    // 元素缺失时直接显示主内容
    if (!overlay || !guitar || !girl || !mainContent) {
        console.error('开场动画元素缺失，跳过动画');
        if (overlay) overlay.style.display = 'none';
        if (mainContent) {
            mainContent.style.visibility = 'visible';
            mainContent.style.opacity = '1';
        }
        return;
    }

    // 设置初始状态
    gsap.set(guitar, { opacity: 0, scale: 0.5, rotation: -10 });
    gsap.set(girl, { opacity: 0, scale: 0.5 });

    // 创建时间线，默认暂停
    const tl = gsap.timeline({ paused: true });

    // 吉他出现动画
    tl.to(guitar, {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 2,
        ease: "elastic.out(1, 0.5)"
    })
    // 等待0.5秒后，背景变亮且小女孩出现
    .to(overlay, {
        backgroundColor: 'rgba(0,0,0,0.3)',
        duration: 1.5
    }, "+=0.5")
    .to(girl, {
        opacity: 1,
        scale: 1,
        duration: 1.5,
        ease: "back.out(1.7)"
    }, "<");

    // 鼠标悬停加速
    guitar.addEventListener('mouseenter', () => {
        tl.timeScale(2); // 时间线速度加倍
    });
    guitar.addEventListener('mouseleave', () => {
        tl.timeScale(1); // 恢复
    });

    // 进入主页面函数
    function enterMain() {
        // 恢复时间线速度
        tl.timeScale(1);
        // 开场容器淡出
        gsap.to(overlay, {
            opacity: 0,
            duration: 1,
            ease: "power2.inOut",
            onComplete: () => {
                overlay.style.display = 'none';
                // 显示主内容
                mainContent.style.visibility = 'visible';
                gsap.to(mainContent, {
                    opacity: 1,
                    duration: 1,
                    ease: "power2.out"
                });
            }
        });
    }

    girl.addEventListener('click', enterMain);

    // 开始播放动画
    setTimeout(() => {
        tl.play();
    }, 100);
});