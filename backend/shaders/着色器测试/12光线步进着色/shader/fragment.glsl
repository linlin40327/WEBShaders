#ifdef GL_ES
precision highp float;
#endif

// ==========================================
// 1. CPU 输入接口 (Uniforms)
// ==========================================
uniform vec2 resolution; // 屏幕分辨率。用于将像素坐标归一化，消除屏幕宽高比拉伸。
uniform float time;      // 时间轴。用于驱动动画（相机的微晃）。

// ==========================================
// 2. 数学工具：二维旋转矩阵
// ==========================================
// 【数学原理】：任何点乘以这个矩阵，等于绕原点旋转 angle 弧度。
// 矩阵公式：[cos(a)  -sin(a)]
//          [sin(a)   cos(a)]
mat2 rotate2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

// ==========================================
// 3. 几何体定义 (SDF - 有向距离场)
// ==========================================
// 【图形学原理】：SDF 不用顶点定义形状，而是用数学公式。
// 输入空间中任意点 p，返回该点到几何体表面的“最短距离”。结果 < 0 在内部，> 0 在外部。

// 胶囊体 SDF（路灯杆）
// 【数学原理】：计算点 p 到线段 ab 的投影距离，再减去半径 r。
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    // 线段投影比例，限制在 [0,1] 之间
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

// 盒子 SDF（灯罩）
// 【数学原理】：利用 abs(p) 将空间映射到第一象限，计算点到边界外延的向量长度。
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// 场景总组合（布尔求交）
float sceneSDF(vec3 p) {
    // 【代码原理】：定义路灯杆、横杆、灯头在三维空间的位置和尺寸
    float pole = sdCapsule(p, vec3(0.0, -2.0, 0.0), vec3(0.0, 1.5, 0.0), 0.05);
    float arm  = sdCapsule(p, vec3(0.0, 1.5, 0.0),  vec3(0.5, 1.7, 0.0), 0.04);
    
    // 平移空间坐标系，等同于平移几何体
    vec3 boxPos = p - vec3(0.5, 1.65, 0.0);
    float lampHead = sdBox(boxPos, vec3(0.15, 0.08, 0.15));
    
    // 【数学原理】：min(A, B) 在 SDF 中代表“并集”（Union），即将所有形状融合为一个场景
    return min(pole, min(arm, lampHead));
}

// ==========================================
// 4. 表面法线计算 (Gradients)
// ==========================================
// 【数学原理】：SDF 的梯度（数学导数）就是该表面的法线方向。
// 我们在 X、Y、Z 三个方向各微调一丁点距离（e），通过差分法近似求解偏导数。
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    float d = sceneSDF(p);
    vec3 n = d - vec3(
        sceneSDF(p - e.xyy), // X 方向偏导
        sceneSDF(p - e.yxy), // Y 方向偏导
        sceneSDF(p - e.yyx)  // Z 方向偏导
    );
    return normalize(n); // 归一化为单位法向量
}

// ==========================================
// 5. 体积光物理模拟 (Volumetric Scattering)
// ==========================================
// 【图形学原理】：光束的本质是空气中的微粒散射了光线。
// 本函数计算空间中单点 p 被路灯照射到的“光子密度”。
float getVolumetricLight(vec3 p, vec3 lightPos) {
    vec3 rayToLight = p - lightPos;
    
    // 【逻辑控制】：如果点在灯头上方，物理上照不到，直接返回 0
    if (rayToLight.y > 0.0) return .0;
    
    // 【数学原理】：喇叭状圆锥体模拟。
    // rayToLight.y 是负数，越往下越小，加上负号后使得 coneRadius 越往下越大
    float coneRadius = 0.15 - rayToLight.y * 0.1; 
    
    // 计算当前点到路灯中心轴 (X,Z 坐标) 的径向距离
    float distToAxis = length(p.xz - lightPos.xz);
    
    // 【数学原理】：smoothstep 实现光束边缘的软过渡（Cubic Hermite 插值），
    // 超过圆锥半径则淡出为 0，接近轴心则为 1
    float beam = smoothstep(coneRadius, 0.0, distToAxis);
    
    // 【物理原理】：光能随距离平方反比衰减（1 / d^2）
    float falloff = 1.0 / (1.0 + dot(rayToLight, rayToLight));
    
    return beam * falloff;
}

// ==========================================
// 6. 主渲染管线 (Main Pipeline)
// ==========================================
void main() {
    // --------------------------------------
    // A. 屏幕坐标变换 (Screen to Camera Space)
    // --------------------------------------
    // 【图形学原理】：将屏幕像素坐标 (比如 1920x1080) 转换到中心为 (0,0)、范围 [-0.5, 0.5] 的正方形坐标系。
    // 除以 resolution.y 是为了防止宽屏导致的画面横向拉伸。
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    
    // --------------------------------------
    // B. 构建虚拟相机 (Ray Setup)
    // --------------------------------------
    vec3 ro = vec3(0.0, 0.5, 3.5);        // 射线起点 (相机位置)
    vec3 rd = normalize(vec3(uv, -1.0)); // 射线方向 (从相机指向屏幕像素)
    
    // 【动态效果】：利用正弦波随时间改变相机的 XZ 坐标，使相机产生平滑的弧形摆动
    ro.xz = rotate2D(sin(time * 0.5) * 0.2) * ro.xz;
    rd.xz = rotate2D(sin(time * 0.5) * 0.2) * rd.xz;
    
    vec3 lightPos = vec3(0.5, 1.55, 0.0); // 灯泡的物理光源坐标
    
    // --------------------------------------
    // C. 第一次 Raymarching：硬表面碰撞检测
    // --------------------------------------
    float t = 0.0;     // 当前射线行驶的总距离
    float tMax = 10.0; // 最大视距，防止光线飞向无穷远导致死循环
    bool hit = false;
    vec3 p = vec3(0.0);
    
    // 【WebGL 1.0 限制】：循环上限必须是写死的编译期常数 (80)
    for (int i = 0; i < 80; i++) {
        p = ro + rd * t;     // 计算当前计算点的位置：P = O + t*D
        float d = sceneSDF(p); // 查表：当前位置距离最近的物体有多远
        if (d < 0.001) {       // 距离小于阈值，视为“击中表面”
            hit = true;
            break;
        }
        if (t > tMax) break;   // 超过最远视距，停止步进
        t += d;                // 【核心数学机制】：安全的步进距离等于 d，绝不会穿透物体
    }
    
    // --------------------------------------
    // D. 表面着色 (Surface Shading)
    // --------------------------------------
    vec3 finalColor = vec3(0.15); // 初始化：背景渲染为暗灰色
    
    if (hit) {
        // 【图形学原理】：经典的兰伯特漫反射模型 (Lambertian Reflection)
        vec3 n = getNormal(p);            // 获取击中点的法线
        vec3 l = normalize(lightPos - p); // 计算击中点指向光源的单位向量
        // dot(n, l) 反应了表面与光线的夹角。夹角越小（直射）越亮。
        float diff = clamp(dot(n, l), 0.0, 1.0) * 0.5 + 0.2; 
        finalColor = vec3(0.2) * diff;    // 路灯材质本身为深灰
    }
    
    // --------------------------------------
    // E. 第二次 Raymarching：体积光积分（核心）
    // --------------------------------------
    // 【图形学原理】：体积光无法通过单次碰撞计算。必须采用“黎曼和积分”。
    // 我们沿着视线射线，等距离采样 60 个点，把每个点的光能累加起来。
    
    float volIntensity = 0.0;
    float maxVolDist = tMax;
    if (hit) {
        maxVolDist = t; // 【重要逻辑】：如果光线击中了灯杆，体积光只能算到灯杆表面，防止光穿透实体
    }
    
    // 【数学原理】：将总长度均分为 60 份，求出每一步的固定步长
    float stepSize = maxVolDist / 60.0; 
    
    for (int i = 0; i < 60; i++) {
        float sampleDist = float(i) * stepSize;
        vec3 samplePoint = ro + rd * sampleDist; // 计算当前等距采样点的 3D 坐标
        
        // 积分累加：不断收集沿途空气中散射回眼睛的光能
        volIntensity += getVolumetricLight(samplePoint, lightPos);
    }
    // 【微积分原理】：黎曼和最终要乘以步长 $\Delta x$ (即 stepSize) 才能正确还原积分值
    volIntensity *= stepSize * 1.5; 
    
    // --------------------------------------
    // F. 颜色混合与后期特效 (Final Compose)
    // --------------------------------------
    vec3 lightColor = vec3(1.0, 0.85, 0.5); // 黄色有色光 RGB
    finalColor += volIntensity * lightColor; // 将体积光的黄色叠加到场景中
    
    // 镜头耀斑 (Glow) 后期：
    // 【代码原理】：通过像素到灯头屏幕投影位置的距离，制造一个除以距离的指数级发光圈。
    float glow = 0.01 / (length(uv - vec2(0.12, 0.32)) + 0.01);
    finalColor += glow * lightColor * 0.2;
    
    // 【WebGL 1.0 规范】：必须将最终颜色写入内置变量，交由硬件光栅化输出
    gl_FragColor = vec4(finalColor, 1.0);
}