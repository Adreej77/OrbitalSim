const MAX_POINTS = 60000;
    function createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.45)');
        gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.08)');
        gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.fill();
        return new THREE.CanvasTexture(canvas);
    }
    const particleTexture = createParticleTexture();
    function logFactorial(n) {
        if (n <= 1) return 0;
        let sum = 0;
        for (let i = 2; i <= n; i++) sum += Math.log(i);
        return sum;
    }
    function assocLaguerre(n, k, x) {
        if (n === 0) return 1;
        if (n === 1) return 1 + k - x;
        let L0 = 1, L1 = 1 + k - x;
        for (let i = 1; i < n; i++) {
            let Lnext = ((2 * i + 1 + k - x) * L1 - (i + k) * L0) / (i + 1);
            L0 = L1;
            L1 = Lnext;
        }
        return L1;
    }
    function assocLegendre(l, m, x) {
        let absM = Math.abs(m);
        if (absM > l) return 0;
        let pmm = 1.0;
        if (absM > 0) {
            let somx2 = Math.sqrt((1.0 - x) * (1.0 + x));
            let fact = 1.0;
            for (let i = 1; i <= absM; i++) {
                pmm *= -fact * somx2;
                fact += 2.0;
            }
        }
        if (l === absM) return pmm;
        let pmmp1 = x * (2.0 * absM + 1.0) * pmm;
        if (l === absM + 1) return pmmp1;
        let pll = 0;
        for (let ll = absM + 2; ll <= l; ll++) {
            pll = (x * (2.0 * ll - 1.0) * pmmp1 - (ll + absM - 1.0) * pmm) / (ll - absM);
            pmm = pmmp1;
            pmmp1 = pll;
        }
        return pll;
    }
    function realSphericalHarmonic(l, m, cosTheta, sinTheta, phi) {
        const absM = Math.abs(m);
        const legendre = assocLegendre(l, absM, cosTheta);
        const logNorm = 0.5 * (Math.log(2 * l + 1) + logFactorial(l - absM) - Math.log(4 * Math.PI) - logFactorial(l + absM));
        const norm = Math.exp(logNorm);
        if (m === 0) return norm * legendre;
        return (m > 0) 
            ? Math.SQRT2 * norm * legendre * Math.cos(m * phi)
            : Math.SQRT2 * norm * legendre * Math.sin(absM * phi);
    }
    function radialWavefunction(n, l, r) {
        const rho = (2 * r) / n;
        const logNorm = 0.5 * (3 * Math.log(2 / n) + logFactorial(n - l - 1) - Math.log(2 * n) - logFactorial(n + l));
        const norm = Math.exp(logNorm);
        const laguerre = assocLaguerre(n - l - 1, 2 * l + 1, rho);
        return norm * Math.exp(-rho * 0.5) * Math.pow(rho, l) * laguerre;
    }
    const OrbitalParticleShader = {
        vertexShader: `
            attribute vec3 aBaseColor;
            attribute vec3 aJitterSeed;
            attribute float aDensity;
            attribute float aRadialDist;
            uniform float uGamma;
            uniform float uTime;
            uniform float uStepTransMult;
            varying vec3 vColor;
            varying float vDensity;
            varying float vTransmissionFactor;
            varying vec3 vOrigPos;
            void main() {
                float t = uTime * 8.0;
                vec3 noiseOffset = vec3(
                    sin(t + aJitterSeed.x * 6.28),
                    cos(t * 1.2 + aJitterSeed.y * 6.28),
                    sin(t * 0.8 + aJitterSeed.z * 6.28)
                ) * 0.015;
                vec3 jitteredPos = position + noiseOffset;
                vOrigPos = position;
                vColor = pow(aBaseColor, vec3(1.0 / uGamma));
                vDensity = aDensity;
                float shellStep = max(0.0, aRadialDist - 1.0);
                float radiusScale = pow(1.01, shellStep);
                vTransmissionFactor = 1.0 * pow(uStepTransMult, shellStep);
                vec4 mvPosition = modelViewMatrix * vec4(jitteredPos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = (8.0 + 10.0 * sqrt(aDensity)) * radiusScale * (14.0 / -mvPosition.z);
            }
        `,
        fragmentShader: `
            uniform sampler2D uMap;
            uniform int uPosSliceAxis;
            uniform float uPosSliceOffset;
            uniform int uNegSliceAxis;
            uniform float uNegSliceOffset;
            varying vec3 vColor;
            varying float vDensity;
            varying float vTransmissionFactor;
            varying vec3 vOrigPos;
            void main() {
                if (uPosSliceAxis == 1 && vOrigPos.x > uPosSliceOffset) discard;
                if (uPosSliceAxis == 2 && vOrigPos.y > uPosSliceOffset) discard;
                if (uPosSliceAxis == 3 && vOrigPos.z > uPosSliceOffset) discard;
                if (uNegSliceAxis == 1 && vOrigPos.x < uNegSliceOffset) discard;
                if (uNegSliceAxis == 2 && vOrigPos.y < uNegSliceOffset) discard;
                if (uNegSliceAxis == 3 && vOrigPos.z < uNegSliceOffset) discard;
                vec4 tex = texture2D(uMap, gl_PointCoord);
                float alpha = vTransmissionFactor * (0.35 + 0.65 * vDensity) * tex.a;
                gl_FragColor = vec4(vColor, alpha);
            }
        `
    };
    THREE.Object3D.DefaultUp.set(0, 0, 1);
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera.position.set(0, -35, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    container.appendChild(renderer.domElement);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    
    // 2D Pan State using Camera Film Offset
    let isPanning = false;
    let startPointer = { x: 0, y: 0 };
    let currentFilmOffset = { x: 0, y: 0 };
    const panSpeed = 1.0;
    function resetScreenPan() {
        currentFilmOffset.x = 0;
        currentFilmOffset.y = 0;
        camera.clearViewOffset();
        camera.updateProjectionMatrix();
    }
    
    document.getElementById('reset-pan-btn').addEventListener('click', (e) => {
        resetScreenPan();
        e.currentTarget.blur();
    });
    
    // Pointer / Touch / Mouse pan bindings
    let initialTouchDist = 0;
    let initialTouchCenter = { x: 0, y: 0 };
    renderer.domElement.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') {
            if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
                isPanning = true;
                startPointer.x = e.clientX;
                startPointer.y = e.clientY;
            }
        }
    });
    // Multi-touch pan for mobile devices
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isPanning = true;
            startPointer.x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            startPointer.y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        }
    }, { passive: true });
    renderer.domElement.addEventListener('touchmove', (e) => {
        if (isPanning && e.touches.length === 2) {
            const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const dx = currentCenterX - startPointer.x;
            const dy = currentCenterY - startPointer.y;
            startPointer.x = currentCenterX;
            startPointer.y = currentCenterY;
            currentFilmOffset.x += dx * panSpeed;
            currentFilmOffset.y -= dy * panSpeed;
            camera.setViewOffset(
                container.clientWidth,
                container.clientHeight,
                -currentFilmOffset.x,
                currentFilmOffset.y,
                container.clientWidth,
                container.clientHeight
            );
        }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', () => {
        isPanning = false;
    });
    window.addEventListener('keydown', (e) => {
        const tag = document.activeElement.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    
        if (e.key === 'Home' || e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            if (document.activeElement) document.activeElement.blur();
            resetScreenPan();
        }
    });
    window.addEventListener('pointermove', (e) => {
        if (!isPanning || e.pointerType !== 'mouse') return;
    
        const dx = e.clientX - startPointer.x;
        const dy = e.clientY - startPointer.y;
    
        startPointer.x = e.clientX;
        startPointer.y = e.clientY;
    
        currentFilmOffset.x += dx * panSpeed;
        currentFilmOffset.y -= dy * panSpeed;
    
        camera.setViewOffset(
            container.clientWidth,
            container.clientHeight,
            -currentFilmOffset.x,
            currentFilmOffset.y,
            container.clientWidth,
            container.clientHeight
        );
    });
    
    window.addEventListener('pointerup', () => {
        isPanning = false;
    });
    function handleResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    
        if (currentFilmOffset.x !== 0 || currentFilmOffset.y !== 0) {
            camera.setViewOffset(
                container.clientWidth,
                container.clientHeight,
                -currentFilmOffset.x,
                currentFilmOffset.y,
                container.clientWidth,
                container.clientHeight
            );
        } else {
            camera.clearViewOffset();
        }
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    // Custom Grid
    const gridGroup = new THREE.Group();
    const gridExtent = 20;
    const gridDivisions = 40;
    const gridStep = (gridExtent * 2) / gridDivisions;
    const gridPositions = [];
    for (let i = -gridExtent; i <= gridExtent; i += gridStep) {
        if (Math.abs(i) > 0.001) {
            gridPositions.push(-gridExtent, i, 0, gridExtent, i, 0);
            gridPositions.push(i, -gridExtent, 0, i, gridExtent, 0);
        }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1f242d, transparent: true, opacity: 0.7 });
    const customGrid = new THREE.LineSegments(gridGeo, gridMat);
    gridGroup.add(customGrid);
    scene.add(gridGroup);
    // Cylinder Axes
    const axisLength = 20;
    const axesGroup = new THREE.Group();
    const axisRadius = 0.03;
    function createCylinderAxis(start, end, colorHex) {
        const direction = new THREE.Vector3().subVectors(end, start);
        const len = direction.length();
        const geom = new THREE.CylinderGeometry(axisRadius, axisRadius, len, 8);
        geom.translate(0, len / 2, 0);
        geom.rotateX(Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: true });
        const cylinder = new THREE.Mesh(geom, mat);
        cylinder.position.copy(start);
        cylinder.lookAt(end);
        return cylinder;
    }
    axesGroup.add(createCylinderAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLength, 0, 0), 0xff4444));
    axesGroup.add(createCylinderAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-axisLength, 0, 0), 0xff8888));
    axesGroup.add(createCylinderAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLength, 0), 0x33ee66));
    axesGroup.add(createCylinderAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -axisLength, 0), 0x88ffaa));
    axesGroup.add(createCylinderAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLength), 0x33ccff));
    axesGroup.add(createCylinderAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -axisLength), 0x99eeff));
    scene.add(axesGroup);
    const nucleus = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(nucleus);
    const posArray = new Float32Array(MAX_POINTS * 3);
    const colArray = new Float32Array(MAX_POINTS * 3);
    const densArray = new Float32Array(MAX_POINTS);
    const rDistArray = new Float32Array(MAX_POINTS);
    const jitArray = new Float32Array(MAX_POINTS * 3);
    for (let i = 0; i < MAX_POINTS * 3; i++) jitArray[i] = Math.random();
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(posArray, 3);
    const colAttr = new THREE.BufferAttribute(colArray, 3);
    const densAttr = new THREE.BufferAttribute(densArray, 1);
    const rDistAttr = new THREE.BufferAttribute(rDistArray, 1);
    const jitAttr = new THREE.BufferAttribute(jitArray, 3);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('aBaseColor', colAttr);
    geometry.setAttribute('aDensity', densAttr);
    geometry.setAttribute('aRadialDist', rDistAttr);
    geometry.setAttribute('aJitterSeed', jitAttr);
    const shaderMaterial = new THREE.ShaderMaterial({
        vertexShader: OrbitalParticleShader.vertexShader,
        fragmentShader: OrbitalParticleShader.fragmentShader,
        uniforms: {
            uMap: { value: particleTexture },
            uGamma: { value: 1.1 },
            uTime: { value: 0.0 },
            uStepTransMult: { value: 1.05 },
            uPosSliceAxis: { value: 0 },
            uPosSliceOffset: { value: 0.0 },
            uNegSliceAxis: { value: 0 },
            uNegSliceOffset: { value: 0.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const pointCloud = new THREE.Points(geometry, shaderMaterial);
    scene.add(pointCloud);
    // Labels
    const labelPosX = document.getElementById('label-pos-x');
    const labelNegX = document.getElementById('label-neg-x');
    const labelPosY = document.getElementById('label-pos-y');
    const labelNegY = document.getElementById('label-neg-y');
    const labelPosZ = document.getElementById('label-pos-z');
    const labelNegZ = document.getElementById('label-neg-z');
    const posVecX = new THREE.Vector3(axisLength + 0.8, 0, 0);
    const negVecX = new THREE.Vector3(-axisLength - 0.8, 0, 0);
    const posVecY = new THREE.Vector3(0, axisLength + 0.8, 0);
    const negVecY = new THREE.Vector3(0, -axisLength - 0.8, 0);
    const posVecZ = new THREE.Vector3(0, 0, axisLength + 0.8);
    const negVecZ = new THREE.Vector3(0, 0, -axisLength - 0.8);
    function updateAxisLabelPositions() {
        if (!axesGroup.visible) {
            labelPosX.style.opacity = '0'; labelNegX.style.opacity = '0';
            labelPosY.style.opacity = '0'; labelNegY.style.opacity = '0';
            labelPosZ.style.opacity = '0'; labelNegZ.style.opacity = '0';
            return;
        }
        const wH = container.clientWidth / 2;
        const hH = container.clientHeight / 2;
        function setLabel(el, pos) {
            const vec = pos.clone().project(camera);
            if (vec.z > 1) { el.style.opacity = '0'; return; }
            el.style.left = `${(vec.x * wH) + wH}px`;
            el.style.top = `${-(vec.y * hH) + hH}px`;
            el.style.opacity = '1';
        }
        setLabel(labelPosX, posVecX);
        setLabel(labelNegX, negVecX);
        setLabel(labelPosY, posVecY);
        setLabel(labelNegY, negVecY);
        setLabel(labelPosZ, posVecZ);
        setLabel(labelNegZ, negVecZ);
    }
    const radialCanvas = document.getElementById('radial-canvas');
    const rCtx = radialCanvas.getContext('2d');
    function drawRadialDistribution(n, l, maxR) {
        const width = radialCanvas.width;
        const height = radialCanvas.height;
        rCtx.clearRect(0, 0, width, height);
        const steps = 140;
        const values = [];
        let maxP = 0;
        let peakR = 0;
        for (let i = 0; i <= steps; i++) {
            const r = (i / steps) * maxR;
            const R = radialWavefunction(n, l, r);
            const radialProb = r * r * R * R;
            values.push(radialProb);
            if (radialProb > maxP) {
                maxP = radialProb;
                peakR = r;
            }
        }
        document.getElementById('r-peak-val').textContent = `${peakR.toFixed(2)} a₀`;
        rCtx.strokeStyle = '#21262d';
        rCtx.lineWidth = 1;
        rCtx.beginPath();
        rCtx.moveTo(0, height - 10);
        rCtx.lineTo(width, height - 10);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.strokeStyle = '#58a6ff';
        rCtx.lineWidth = 2;
        for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * width;
            const normVal = maxP > 0 ? values[i] / maxP : 0;
            const y = (height - 12) - (normVal * (height - 24));
            if (i === 0) rCtx.moveTo(x, y);
            else rCtx.lineTo(x, y);
        }
        rCtx.stroke();
        const peakX = (peakR / maxR) * width;
        rCtx.fillStyle = '#7ee787';
        rCtx.beginPath();
        rCtx.arc(peakX, 12, 3, 0, Math.PI * 2);
        rCtx.fill();
    }
    function updateOrbitalData(n, l, m, targetPoints) {
        const t0 = performance.now();
        const maxR = (n * n * 2.8) + (l * 1.5) + 2.5;
        let maxProb = 1e-8;
        for (let i = 1; i <= 50; i++) {
            const rTest = (i / 50) * maxR;
            const R = radialWavefunction(n, l, rTest);
            const p = R * R;
            if (p > maxProb) maxProb = p;
        }
        const angPeak = (2 * l + 1) / (4 * Math.PI);
        const peakEst = maxProb * angPeak;
        let count = 0;
        const maxAttempts = targetPoints * 120;
        let attempts = 0;
        const pos = posAttr.array;
        const col = colAttr.array;
        const dens = densAttr.array;
        const rDist = rDistAttr.array;
        while (count < targetPoints && attempts < maxAttempts) {
            attempts++;
            
            const r = Math.cbrt(Math.random()) * maxR;
            const cosTheta = 2 * Math.random() - 1;
            const sinTheta = Math.sqrt(Math.max(0, 1.0 - cosTheta * cosTheta));
            const phi = Math.random() * 6.2831853;
            const R = radialWavefunction(n, l, r);
            const Y = realSphericalHarmonic(l, m, cosTheta, sinTheta, phi);
            const psi = R * Y;
            const prob = psi * psi;
            const normProb = prob / peakEst;
            if (Math.random() < normProb) {
                const idx3 = count * 3;
                const rSin = r * sinTheta;
                pos[idx3]     = rSin * Math.cos(phi);
                pos[idx3 + 1] = rSin * Math.sin(phi);
                pos[idx3 + 2] = r * cosTheta;
                if (psi >= 0) {
                    col[idx3] = 0.22; col[idx3 + 1] = 0.65; col[idx3 + 2] = 1.0;
                } else {
                    col[idx3] = 1.0; col[idx3 + 1] = 0.32; col[idx3 + 2] = 0.32;
                }
                dens[count] = Math.min(1.0, normProb);
                rDist[count] = r;
                count++;
            }
        }
        geometry.setDrawRange(0, count);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        densAttr.needsUpdate = true;
        rDistAttr.needsUpdate = true;
        drawRadialDistribution(n, l, maxR);
        const t1 = performance.now();
        document.getElementById('gen-time-val').textContent = `${(t1 - t0).toFixed(2)} ms`;
    }
    // Custom Dropdown Engine
    function setupCustomDropdown(wrapperId, onChange) {
        const wrapper = document.getElementById(wrapperId);
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const optionsContainer = wrapper.querySelector('.custom-options-container');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper.open').forEach(el => {
                if (el !== wrapper) el.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });
        optionsContainer.addEventListener('click', (e) => {
            const opt = e.target.closest('.custom-option');
            if (!opt) return;
            const val = opt.getAttribute('data-value');
            optionsContainer.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            trigger.querySelector('span').innerHTML = opt.innerHTML;
            wrapper.classList.remove('open');
            if (onChange) onChange(val, opt);
        });
        return {
            setValue: (val) => {
                const opt = optionsContainer.querySelector(`.custom-option[data-value="${val}"]`);
                if (opt) {
                    optionsContainer.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    trigger.querySelector('span').innerHTML = opt.innerHTML;
                }
            },
            getValue: () => {
                const opt = optionsContainer.querySelector('.custom-option.selected');
                return opt ? opt.getAttribute('data-value') : null;
            }
        };
    }
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper.open').forEach(el => el.classList.remove('open'));
    });
    // State and Handlers
    let curN = 1, curL = 0, curM = 0, curS = 0.5;
    const lNames = ['s', 'p', 'd', 'f', 'g', 'h', 'i'];
    function getAxisAlignmentInfo(l, m) {
        if (l === 0) return "s";
        if (l === 1) {
            if (m === 0) return "p<sub>z</sub>";
            if (m === 1) return "p<sub>x</sub>";
            if (m === -1) return "p<sub>y</sub>";
        } else if (l === 2) {
            if (m === 0) return "d<sub>z²</sub>";
            if (m === 1) return "d<sub>xz</sub>";
            if (m === -1) return "d<sub>yz</sub>";
            if (m === 2) return "d<sub>x²-y²</sub>";
            if (m === -2) return "d<sub>xy</sub>";
        } else if (l === 3) {
            if (m === 0) return "f<sub>z³</sub>";
            if (m === 1) return "f<sub>xz²</sub>";
            if (m === -1) return "f<sub>yz²</sub>";
            if (m === 2) return "f<sub>z(x²-y²)</sub>";
            if (m === -2) return "f<sub>xyz</sub>";
            if (m === 3) return "f<sub>x(x²-3y²)</sub>";
            if (m === -3) return "f<sub>y(3x²-y²)</sub>";
        } else if (l === 4) {
            if (m === 0) return "g<sub>z⁴</sub>";
            if (m === 1) return "g<sub>xz³</sub>";
            if (m === -1) return "g<sub>yz³</sub>";
            if (m === 2) return "g<sub>z²(x²-y²)</sub>";
            if (m === -2) return "g<sub>xyz²</sub>";
            if (m === 3) return "g<sub>xz(x²-3y²)</sub>";
            if (m === -3) return "g<sub>yz(3x²-y²)</sub>";
            if (m === 4) return "g<sub>x⁴+y⁴-6x²y²</sub>";
            if (m === -4) return "g<sub>xy(x²-y²)</sub>";
        } else if (l === 5) {
            return `h<sub>m=${m > 0 ? '+' + m : m}</sub>`;
        } else if (l === 6) {
            return `i<sub>m=${m > 0 ? '+' + m : m}</sub>`;
        }
        return `m=${m > 0 ? '+' + m : m}`;
    }
    function toSubscript(num) {
        const subDigits = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','-':'₋','+':'₊' };
        return String(num).split('').map(c => subDigits[c] || c).join('');
    }
    function toSuperscript(num) {
        const supDigits = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻','+':'⁺' };
        return String(num).split('').map(c => supDigits[c] || c).join('');
    }
    const presetCtrl = setupCustomDropdown('preset-custom-select', (val) => {
        if (val === '1s') { nCtrl.setValue('1'); updateLOptions(); }
        else if (val === '2pz') { nCtrl.setValue('2'); updateLOptions(); lCtrl.setValue('1'); updateMOptions(); mCtrl.setValue('0'); }
        else if (val === '3d_z2') { nCtrl.setValue('3'); updateLOptions(); lCtrl.setValue('2'); updateMOptions(); mCtrl.setValue('0'); }
        else if (val === '3d_xy') { nCtrl.setValue('3'); updateLOptions(); lCtrl.setValue('2'); updateMOptions(); mCtrl.setValue('-2'); }
        else if (val === '4f_0') { nCtrl.setValue('4'); updateLOptions(); lCtrl.setValue('3'); updateMOptions(); mCtrl.setValue('0'); }
        else if (val === '3s') { nCtrl.setValue('3'); updateLOptions(); lCtrl.setValue('0'); updateMOptions(); }
        updateSimulation();
    });
    const nCtrl = setupCustomDropdown('n-custom-select', (val) => {
        curN = parseInt(val);
        updateLOptions();
        updateSimulation();
    });
    const lCtrl = setupCustomDropdown('l-custom-select', (val) => {
        curL = parseInt(val);
        updateMOptions();
        updateSimulation();
    });
    const mCtrl = setupCustomDropdown('m-custom-select', (val) => {
        curM = parseInt(val);
        updateSimulation();
    });
    const sCtrl = setupCustomDropdown('s-custom-select', (val) => {
        curS = parseFloat(val);
        updateSimulation();
    });
    const gizmoCtrl = setupCustomDropdown('gizmo-custom-select', (val) => {
        document.getElementById('gizmo-val').textContent = val.toUpperCase();
        axesGroup.visible = (val === 'on' || val === 'axes');
        gridGroup.visible = (val === 'on' || val === 'grid');
    });
    const axisMap = { none: 0, x: 1, y: 2, z: 3 };
    const posSliceCtrl = setupCustomDropdown('pos-slice-select', (val) => {
        shaderMaterial.uniforms.uPosSliceAxis.value = axisMap[val];
    });
    const negSliceCtrl = setupCustomDropdown('neg-slice-select', (val) => {
        shaderMaterial.uniforms.uNegSliceAxis.value = axisMap[val];
    });
    function updateLOptions() {
        curN = parseInt(nCtrl.getValue() || '1');
        const lContainer = document.getElementById('l-custom-options');
        lContainer.innerHTML = '';
        for (let l = 0; l < curN; l++) {
            const opt = document.createElement('div');
            opt.className = `custom-option ${l === 0 ? 'selected' : ''}`;
            opt.setAttribute('data-value', l);
            opt.innerHTML = `${l} (${lNames[l] || 'l=' + l})`;
            lContainer.appendChild(opt);
        }
        curL = 0;
        lCtrl.setValue('0');
        updateMOptions();
    }
    function updateMOptions() {
        curL = parseInt(lCtrl.getValue() || '0');
        const mContainer = document.getElementById('m-custom-options');
        mContainer.innerHTML = '';
        for (let m = -curL; m <= curL; m++) {
            const opt = document.createElement('div');
            opt.className = `custom-option ${m === 0 ? 'selected' : ''}`;
            opt.setAttribute('data-value', m);
            const mStr = m > 0 ? `+${m}` : `${m}`;
            const alignText = getAxisAlignmentInfo(curL, m);
            opt.innerHTML = `<span>${mStr}</span><span class="sub-align">${alignText}</span>`;
            mContainer.appendChild(opt);
        }
        curM = 0;
        mCtrl.setValue('0');
    }
    function updateSimulation() {
        curN = parseInt(nCtrl.getValue() || '1');
        curL = parseInt(lCtrl.getValue() || '0');
        curM = parseInt(mCtrl.getValue() || '0');
        curS = parseFloat(sCtrl.getValue() || '0.5');
        const numPoints = Math.min(parseInt(pointCountInput.value), MAX_POINTS);
        const alignmentStr = getAxisAlignmentInfo(curL, curM);
        document.getElementById('n-val').textContent = curN;
        document.getElementById('l-val').textContent = `${curL} (${lNames[curL] || curL})`;
        document.getElementById('m-val').textContent = curM > 0 ? `+${curM}` : curM;
        document.getElementById('s-val').textContent = curS > 0 ? '+1/2' : '-1/2';
        document.getElementById('points-val').textContent = numPoints.toLocaleString();
        document.getElementById('orbital-name').textContent = `${curN}${lNames[curL] || curL}`;
        document.getElementById('orbital-axis-alignment').innerHTML = alignmentStr;
        document.getElementById('radial-nodes').textContent = `n - l - 1 = ${curN - curL - 1}`;
        document.getElementById('angular-nodes').textContent = `l = ${curL}`;
        document.getElementById('total-nodes').textContent = `n - 1 = ${curN - 1}`;
        document.getElementById('degeneracy-val').textContent = `2l + 1 = ${2 * curL + 1} states`;
        
        const subNLM = `${toSubscript(curN)}${toSubscript(curL)}${toSubscript(curM)}`;
        const subNL = `${toSubscript(curN)}${toSubscript(curL)}`;
        const subL = `${toSubscript(curL)}`;
        const supM = `${toSuperscript(curM)}`;
        document.getElementById('wave-math-repr').textContent = `ψ${subNLM}(r,θ,φ) = R${subNL}(r) · Y${subL}${supM}(θ,φ)`;
        updateOrbitalData(curN, curL, curM, numPoints);
    }
    // Controls Toggle & Slider Bindings
    document.getElementById('controls-toggle').addEventListener('click', (e) => {
        document.getElementById('controls-wrapper').classList.toggle('collapsed');
        e.currentTarget.blur();
    });
    const stepTransSlider = document.getElementById('step-trans-slider');
    const gammaSlider = document.getElementById('gamma-slider');
    const posSliceOffset = document.getElementById('pos-slice-offset');
    const negSliceOffset = document.getElementById('neg-slice-offset');
    const pointCountInput = document.getElementById('point-count');
    stepTransSlider.addEventListener('input', () => {
        const val = parseFloat(stepTransSlider.value);
        document.getElementById('step-trans-val').textContent = `${val.toFixed(2)}x`;
        shaderMaterial.uniforms.uStepTransMult.value = val;
    });
    document.getElementById('reset-step-trans').addEventListener('click', () => {
        stepTransSlider.value = "1.05";
        document.getElementById('step-trans-val').textContent = "1.05x";
        shaderMaterial.uniforms.uStepTransMult.value = 1.05;
    });
    gammaSlider.addEventListener('input', () => {
        const val = parseFloat(gammaSlider.value);
        document.getElementById('gamma-val').textContent = val.toFixed(1);
        shaderMaterial.uniforms.uGamma.value = val;
    });
    document.getElementById('reset-gamma').addEventListener('click', () => {
        gammaSlider.value = "1.1";
        document.getElementById('gamma-val').textContent = "1.1";
        shaderMaterial.uniforms.uGamma.value = 1.1;
    });
    posSliceOffset.addEventListener('input', () => {
        const val = parseFloat(posSliceOffset.value);
        document.getElementById('pos-slice-val').textContent = `${val.toFixed(1)} a₀`;
        shaderMaterial.uniforms.uPosSliceOffset.value = val;
    });
    document.getElementById('reset-pos-slice').addEventListener('click', () => {
        posSliceOffset.value = "0.0";
        document.getElementById('pos-slice-val').textContent = "0.0 a₀";
        shaderMaterial.uniforms.uPosSliceOffset.value = 0.0;
    });
    negSliceOffset.addEventListener('input', () => {
        const val = parseFloat(negSliceOffset.value);
        document.getElementById('neg-slice-val').textContent = `${val.toFixed(1)} a₀`;
        shaderMaterial.uniforms.uNegSliceOffset.value = val;
    });
    document.getElementById('reset-neg-slice').addEventListener('click', () => {
        negSliceOffset.value = "0.0";
        document.getElementById('neg-slice-val').textContent = "0.0 a₀";
        shaderMaterial.uniforms.uNegSliceOffset.value = 0.0;
    });
    pointCountInput.addEventListener('input', () => {
        document.getElementById('points-val').textContent = parseInt(pointCountInput.value).toLocaleString();
    });
    pointCountInput.addEventListener('change', updateSimulation);
    document.getElementById('reset-point-count').addEventListener('click', () => {
        pointCountInput.value = "30000";
        document.getElementById('points-val').textContent = "30,000";
        updateSimulation();
    });
    // Initialize Options & Trigger Initial Simulation
    updateLOptions();
    updateSimulation();
    // Render Loop
    const fpsValEl = document.getElementById('fps-val');
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let frameTimeAcc = 0;
    let lastStats = performance.now();
    function renderFrame(currentTime) {
        const delta = Math.min((currentTime - lastFrameTime) / 1000, 0.1);
        lastFrameTime = currentTime;
        shaderMaterial.uniforms.uTime.value = currentTime * 0.001;
        controls.update();
        updateAxisLabelPositions();
        renderer.render(scene, camera);
        frameTimeAcc += delta;
        frameCount++;
        if (currentTime - lastStats >= 250) {
            fpsValEl.textContent = Math.round(frameCount / frameTimeAcc);
            frameTimeAcc = 0;
            frameCount = 0;
            lastStats = currentTime;
        }
        requestAnimationFrame(renderFrame);
    }
    requestAnimationFrame(renderFrame);