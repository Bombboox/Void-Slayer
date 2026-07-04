// Ported verbatim from Graytown's constants.h.
// Coordinate system: origin top-left, +Y points DOWN (gravity positive, jump
// sets a negative vy).

// ── Window ────────────────────────────────────────────────────────────────────
export const WINDOW_W = 800;
export const WINDOW_H = 600;

// ── Player geometry ───────────────────────────────────────────────────────────
export const PW = 20.0;
export const PH = 28.0;

// ── Health & damage ───────────────────────────────────────────────────────────
export const PLAYER_MAX_HP   = 100;
export const DMG_ENEMY_TOUCH = 20;   // touching an enemy's body/attack box
export const DMG_PLASMA      = 15;   // a deepblue plasma ball
export const BULLET_DAMAGE   = 10;   // the player's own shots, dealt to enemies

// Enemies scale linearly with the player's level: +10% HP and damage per level.
export const ENEMY_SCALE_PER_LEVEL = 0.10;

// ── Progression ───────────────────────────────────────────────────────────────
// EXP to go from level x to x+1 is 100 * 1.15^x (levels start at 0).
export const EXP_BASE   = 100;
export const EXP_GROWTH = 1.15;
export const EXP_REWARD = { lilguy: 22, eyefly: 26, deepblue: 45 };

// Hearts and keys are made ~2.5x rarer than their rolled amounts (from every
// source): each unit only actually drops this fraction of the time.
export const HEART_KEY_KEEP = 0.4;

// ── Stats (skill points) ──────────────────────────────────────────────────────
// Each level grants 5 points, spent across 5 stats. Increments are deliberately
// modest so a single point is a nudge, not a doubling.
export const SKILL_POINTS_PER_LEVEL = 5;
export const DMG_PER_POINT   = 1;      // + flat bullet damage (base BULLET_DAMAGE)
export const HP_PER_POINT    = 10;     // + max HP (base PLAYER_MAX_HP)
export const ARMOR_K         = 40;     // incoming dmg *= K/(K+armorPoints); diminishing
export const CRIT_BASE       = 0.01;   // 1% base crit chance
export const CRIT_PER_POINT  = 0.005;  // +0.5% per point
export const CRIT_MULT       = 2;      // crits deal 2x
export const SPEED_PER_POINT = 0.01;   // +4% run speed AND dash distance per point

// ── Items (equipment) ─────────────────────────────────────────────────────────
// Each equipped item is worth ~5 skill points in its stat. Attack-speed and
// lifesteal have no skill-point version, so they get a balanced flat value.
export const ITEM_POINTS = 5;            // an item ≈ this many skill points
export const ATK_SPEED_BULLET = 0.15;    // +15% bullet speed per attack_speed item
export const ATK_SPEED_PIERCE_PER = 2;   // every N attack_speed items => +1 pierce
export const LIFESTEAL_PER_ITEM = 0.06;  // heal 6% of damage dealt, per lifesteal item

// ── Horizontal movement ───────────────────────────────────────────────────────
export const GROUND_ACCEL = 2000.0;
export const GROUND_FRIC   = 1600.0;
export const AIR_ACCEL     = 1200.0;
export const AIR_FRIC      = 400.0;
export const MAX_RUN       = 200.0;

// ── Jump ──────────────────────────────────────────────────────────────────────
export const JUMP_SPEED     = -350.0;
export const JUMP_HOLD_TIME = 0.18;
export const JUMP_HOLD_GRAV = 400.0;
export const GRAVITY        = 1400.0;
export const MAX_FALL       = 600.0;
export const COYOTE_TIME    = 0.08;
export const JUMP_BUFFER    = 0.08;

// ── Wall hop ─────────────────────────────────────────────────────────────────
export const WALL_HOP_VX   = 220.0;
export const WALL_HOP_VY   = -380.0;
export const WALL_SLIDE_VY = 80.0;

// ── Dash ─────────────────────────────────────────────────────────────────────
export const DASH_SPEED     = 500.0;
export const DASH_DURATION  = 0.25;
export const DASH_END_SPEED = 160.0;
export const DASH_COOLDOWN  = 1.5;

// ── Afterimage ────────────────────────────────────────────────────────────────
export const AFTERIMAGE_COUNT    = 8;
export const AFTERIMAGE_INTERVAL = DASH_DURATION / AFTERIMAGE_COUNT;

// ── Bullets ───────────────────────────────────────────────────────────────────
export const BULLET_SPEED    = 600.0;
export const BULLET_W        = 6.0;
export const BULLET_H        = 6.0;
export const BULLET_LIFETIME = 1.2;
export const BULLET_MAX      = 4;

// ── Enemies (shared) ─────────────────────────────────────────────────────────
export const ENEMY_GRAVITY   = 1400.0;
export const ENEMY_MAX_FALL  = 600.0;
export const ENEMY_FLASH_DUR = 0.14;   // seconds an enemy sprite stays lit after a hit
export const ENEMY_ANIM_FPS  = 12;
export const ENEMY_ATTACK_HEIGHT = 48;

// ── Lilguy ───────────────────────────────────────────────────────────────────
export const LILGUY_MAX_HP          = 45;
export const LILGUY_SPEED           = 80.0;
export const LILGUY_CHASE_RANGE     = 160;
export const LILGUY_ATTACK_RANGE    = 40;
export const LILGUY_ATTACK_COOLDOWN = 1.4;

// ── Eyefly ───────────────────────────────────────────────────────────────────
export const EYEFLY_MAX_HP          = 45;
export const EYEFLY_PATROL_SPEED    = 60.0;
export const EYEFLY_PATROL_ACCEL    = 120.0;
export const EYEFLY_CHASE_SPEED     = 140.0;
export const EYEFLY_CHASE_ACCEL     = 300.0;
export const EYEFLY_DETECT_RANGE    = 240;
export const EYEFLY_ATTACK_RANGE    = 120;
export const EYEFLY_ATTACK_COOLDOWN = 2.0;

// ── Deepblue (ranged ground enemy) ────────────────────────────────────────────
export const DEEPBLUE_MAX_HP         = 70;
export const DEEPBLUE_SPEED          = 55.0;
export const DEEPBLUE_DETECT_RANGE   = 460;  // large: it's a ranged attacker
export const DEEPBLUE_ATTACK_COOLDOWN = 1.5;
export const DEEPBLUE_SHOOT_FRAME    = 11;   // attack-clip frame the muzzle fires on
export const DEEPBLUE_IDLE_MIN       = 1.0;  // random idle/walk dwell times
export const DEEPBLUE_IDLE_MAX       = 2.6;
export const DEEPBLUE_WALK_MIN       = 0.8;
export const DEEPBLUE_WALK_MAX       = 1.8;

// ── Buh (wall-crawler) ────────────────────────────────────────────────────────
export const BUH_MAX_HP          = 55;
export const BUH_WALK_SPEED      = 55.0;
export const BUH_DETECT_RANGE    = 420;  // ~2x — it can pounce from farther
export const BUH_ATTACK_COOLDOWN = 2.4;
export const BUH_SCALE           = 0.7;  // draw/collision scale (it's rendered smaller)
export const BUH_GRAVITY         = 900.0;
export const BUH_LEAP_NORMAL     = 300.0; // launch speed away from the surface
export const BUH_LEAP_TANGENT    = 150.0; // sideways launch along the surface
export const BUH_POUNCE_SPEED    = 360.0; // lunge speed toward the player

// ── Spike block (a floor trap: stays down until you land on it) ───────────────
export const SPIKE_DELAY  = 1.0;  // s after the player lands before the spikes rise
export const SPIKE_ACTIVE = 3.0;  // s the spikes stay out once up
export const SPIKE_FPS    = 14;   // activate / deactivate animation speed
export const SPIKE_DMG    = 20;   // damage per hit while impaled

// ── Plasma (enemy energy projectile) ──────────────────────────────────────────
export const PLASMA_SPEED    = 300.0;
export const PLASMA_SIZE     = 12.0;
export const PLASMA_LIFETIME = 4.0;
export const PLASMA_CORE     = [0.72, 0.92, 1.0]; // glowing light-blue core
export const PLASMA_LIGHT    = [0.40, 0.75, 1.0]; // its emitted light color

// ── Player knockback (engine-local) ────────────────────────────────────────────
export const KNOCKBACK_SPEED = 360;  // push away from the box that hit you
export const KNOCKBACK_UP    = 220;  // extra upward pop
export const HITSTUN_TIME    = 0.25; // seconds of suppressed control after a hit
export const IFRAME_TIME     = 1.25; // seconds of invulnerability after taking a hit

// ── Room grid (engine-local; not in constants.h) ───────────────────────────────
// Rooms are grid-based and shown one-at-a-time, Binding-of-Isaac style.
export const TILE      = 32;
export const ROOM_COLS = 37;            // includes the 1-tile perimeter walls
export const ROOM_ROWS = 19;            // interior 35 x 17 (35 = 5..7 scenarios)
export const ROOM_W    = ROOM_COLS * TILE; // 1184
export const ROOM_H    = ROOM_ROWS * TILE; // 608
export const DOOR_TILES = 3;            // width of a door opening, in tiles
export const DOOR_CHANCE = 0.55;        // chance an undecided side gets a door
export const TRANSITION_TIME = 0.45;    // seconds for the room-slide
export const VIEW_MARGIN = 1.08;        // >1 leaves a little space around the room

// World-units per repeat of the looping brick background. Keep it a common
// divisor of ROOM_W (1184) and ROOM_H (608) — i.e. a divisor of 32 — so the
// pattern stays seamless across adjacent rooms during transitions.
export const BG_TILE = 32;
