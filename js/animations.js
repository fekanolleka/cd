/**
 * Sistema de Animaciones - ModeX Pro
 * Controla las animaciones de scroll reveal y efectos interactivos
 */

// Animación de elementos al hacer scroll
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);

    // Observar todos los elementos con clase 'reveal'
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// Crear partículas flotantes animadas
function createFloatingParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Tamaño aleatorio
        const size = Math.random() * 4 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        
        // Posición aleatoria
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        
        // Animación aleatoria
        const animations = ['particleFloat1', 'particleFloat2', 'particleFloat3'];
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
        particle.style.animation = `${randomAnimation} ${15 + Math.random() * 10}s infinite ease-in-out`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        
        particlesContainer.appendChild(particle);
    }
}

// Efecto parallax suave en el scroll
function initParallaxEffect() {
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.parallax');
        
        parallaxElements.forEach(el => {
            const speed = el.dataset.speed || 0.5;
            el.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });
}

// Animación de contadores numéricos
function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000; // 2 segundos
        const increment = target / (duration / 16); // 60 FPS
        let current = 0;
        
        const updateCounter = () => {
            current += increment;
            if (current < target) {
                counter.textContent = Math.floor(current) + (counter.dataset.suffix || '');
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target + (counter.dataset.suffix || '');
            }
        };
        
        // Observar cuando el contador entra en el viewport
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !counter.classList.contains('counted')) {
                    counter.classList.add('counted');
                    updateCounter();
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(counter);
    });
}

// Efecto de hover 3D en tarjetas
function init3DCardEffect() {
    const cards = document.querySelectorAll('.card-3d');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
        });
    });
}

// Texto que aparece letra por letra
function typeWriterEffect(element, text, speed = 50) {
    let i = 0;
    element.textContent = '';
    
    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    
    type();
}

// Animación de gradiente de fondo en movimiento
function initAnimatedGradient() {
    const gradients = document.querySelectorAll('.animated-gradient');
    
    gradients.forEach(gradient => {
        let hue = 0;
        setInterval(() => {
            hue = (hue + 1) % 360;
            gradient.style.background = `linear-gradient(${hue}deg, rgba(255, 215, 0, 0.1), rgba(255, 140, 0, 0.1))`;
        }, 50);
    });
}

// Cursor personalizado con efecto de brillo
function initCustomCursor() {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.8), transparent);
        pointer-events: none;
        z-index: 9999;
        transition: transform 0.1s ease;
        display: none;
    `;
    document.body.appendChild(cursor);
    
    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
        cursor.style.display = 'block';
    });
    
    document.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.style.transform = 'scale(2)';
        });
        el.addEventListener('mouseleave', () => {
            cursor.style.transform = 'scale(1)';
        });
    });
}

// Inicializar todas las animaciones cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 Inicializando sistema de animaciones...');
    
    // Inicializar animaciones
    initScrollAnimations();
    createFloatingParticles();
    initParallaxEffect();
    animateCounters();
    init3DCardEffect();
    initAnimatedGradient();
    
    // Opcional: Cursor personalizado (descomentar para activar)
    // initCustomCursor();
    
    // Agregar clases de animación a elementos específicos
    setTimeout(() => {
        // Animar elementos del header
        document.querySelectorAll('header .nav-link').forEach((link, index) => {
            link.classList.add('animate-fade-in-down');
            link.style.animationDelay = `${index * 0.1}s`;
        });
        
        // Animar tarjetas
        document.querySelectorAll('.card-hover, .team-member').forEach((card, index) => {
            card.classList.add('reveal', 'animate-fade-in-up');
            card.style.animationDelay = `${index * 0.1}s`;
        });
    }, 100);
    
    console.log('✅ Sistema de animaciones inicializado correctamente');
});

// Animación suave al hacer scroll a secciones
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Añadir efecto de ripple al hacer clic en botones
document.querySelectorAll('button, .btn-primary').forEach(button => {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.5);
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            left: ${x}px;
            top: ${y}px;
            pointer-events: none;
        `;
        
        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    });
});

// Agregar estilos para el efecto ripple
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

