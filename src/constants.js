// Ported verbatim from Graytown's constants.h.
// Coordinate system: origin top-left, +Y points DOWN (gravity positive, jump
// sets a negative vy).

// ── Window ────────────────────────────────────────────────────────────────────
export const WINDOW_W = 800;
export const WINDOW_H = 600;

// ── Player geometry ───────────────────────────────────────────────────────────
export const PW = 20.0;
export const PH = 28.0;
// Player sprite: the 192px frame is drawn at this scale (its bodyBox is anchored,
// feet-centered, onto the PW×PH physics box), animating at PLAYER_ANIM_FPS.
export const PLAYER_SPRITE_SCALE = 1.0;
export const PLAYER_ANIM_FPS     = 10;

// ── Health & damage ───────────────────────────────────────────────────────────
export const PLAYER_MAX_HP   = 100;
export const DMG_ENEMY_TOUCH = 20;   // touching an enemy's body/attack box
export const DMG_PLASMA      = 15;   // a deepblue plasma ball
export const BULLET_DAMAGE   = 10;   // the player's own shots, dealt to enemies

// Enemies scale linearly with the player's level: +10% HP and damage per level.
export const ENEMY_SCALE_PER_LEVEL = 0.10;
// ...and multiplicatively with the floor: x1.5 HP & damage per floor past the
// first (compounding) — later floors are meant to feel significantly harder.
export const ENEMY_FLOOR_GROWTH = 1.5;

// ── Progression ───────────────────────────────────────────────────────────────
// EXP to go from level x to x+1 is 100 * 1.15^x (levels start at 0).
export const EXP_BASE   = 100;
export const EXP_GROWTH = 1.15;
export const EXP_REWARD = { lilguy: 22, eyefly: 26, deepblue: 45 };
// EXP payouts (kills, mini-bosses, bosses) grow with the floor so leveling
// keeps pace with the enemies' floor scaling.
export const EXP_FLOOR_GROWTH = 1.5;

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
export const LIFESTEAL_PER_ITEM = 0.02;  // heal 2% of damage dealt, per lifesteal item

// ── Horizontal movement ───────────────────────────────────────────────────────
export const GROUND_ACCEL = 2000.0;
export const GROUND_FRIC   = 1600.0;
export const AIR_ACCEL     = 1200.0;
export const AIR_FRIC      = 400.0;
export const MAX_RUN       = 200.0;
// The speed STAT keeps stacking for abilities that scale off it, but actual
// run/dash speed HARD-caps at +30% (buffs included) — beyond that the
// character gets too hard to control. The stat also converts at half rate
// into effective speed: +60% stat -> +30% effective.
export const MOVE_SPEED_CAP = 0.30;
export const MOVE_SPEED_EFF = 0.5;

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

// ── Swinger (a pendulum hazard hung from the ceiling on a chain of rings) ─────
// Driven as a real pendulum (accel = -GRAVITY·sinθ), so it speeds up through the
// bottom and slows at the extremes like an actual swing.
export const SWINGER_DMG     = 22;   // damage from the swinging head
export const SWINGER_GRAVITY = 9.0;  // restoring acceleration (higher = faster swing)
export const SWINGER_ANGLE   = 0.72; // release amplitude from straight-down (rad)
export const SWINGER_LINK    = 30;   // length of each chain link (px)
export const SWINGER_LAG     = 3;    // chain whip: frames each link lags the one above

// ── Special rooms (angel / maw) ───────────────────────────────────────────────
export const FLOOR_ANGEL_CHANCE = 0.5;  // chance a floor contains an angel room
// (a maw crafting room is guaranteed on every floor)
export const ANGEL_HEAL_FRAC    = 0.5;  // angel statue heals this fraction of max HP (once)
export const MAW_FPS            = 3;     // maw.png is a 2-frame idle animation

// ── Battle rooms (flat arena for a mini-boss) ─────────────────────────────────
export const FLOOR_BATTLE_CHANCE = 0.5; // chance a floor contains a battle arena at all
export const LIGHT_COL_TILES    = 3;    // width of the central holy light column (tiles)
export const SMOKE_FRAMES       = 4;    // smoke.png is a 4-frame 32x32 strip
export const SMOKE_FPS          = 8;
// Reinforcements drop through the ceiling gaps in pairs while the boss fight is on.
export const BATTLE_REINFORCE_MIN  = 10.0; // seconds between drops (min)
export const BATTLE_REINFORCE_MAX  = 18.0; // seconds between drops (max)
export const BATTLE_REINFORCE_PAIR = 2;    // enemies per drop

// ── Kisser (mini-boss) ────────────────────────────────────────────────────────
export const KISSER_MAX_HP      = 1395;  // beefy mini-boss (1.5x, then 1.5x again)
export const KISSER_SPEED       = 74;
export const KISSER_MELEE_RANGE = 180;   // within this: cleaver / punch (closes in first)
export const KISSER_FLAME_RANGE = 1000;  // beyond melee (up to this): flame
export const KISSER_ATTACK_CD   = 0.7;   // pause between attacks
export const KISSER_FLAME_CD    = 7.0;   // extra cooldown on the flame attack alone
export const KISSER_TOUCH_DMG   = 26;    // body/melee contact damage
export const KISSER_IDLE_CHANCE = 0.25;  // chance to stand idle between actions
export const KISSER_EXP_REWARD  = 800;   // huge exp payout for the kill
// Pre-battle intro: the screen shakes and the holy light fades before the fight.
export const BATTLE_INTRO_TIME  = 1.2;   // seconds the shake + light-fade runs
export const BATTLE_SUSPENSE_TIME = 2.0; // extra beat (dark & quiet) after the rumble
export const BATTLE_SHAKE_MAG   = 16;    // camera shake amplitude (world px)
export const BATTLE_DROP_VY     = 320;   // downward shove on dropped-in reinforcements

// Flame particles (the kisser's ranged attack): a continuous stream of bouncing
// fireballs sprayed for the duration of the attack.
export const FLAME_DMG           = 15;
export const FLAME_GRAVITY       = 520;
export const FLAME_LIFETIME      = 3.2;
export const FLAME_EMIT_INTERVAL = 0.05; // seconds between emissions while firing
export const FLAME_COUNT_MIN     = 1;    // flames per emission
export const FLAME_COUNT_MAX     = 3;
export const FLAME_SPEED_MIN     = 300;
export const FLAME_SPEED_MAX     = 620;
export const FLAME_SIZE_MIN      = 10;
export const FLAME_SIZE_MAX      = 24;
export const FLAME_BOUNCE_MAX    = 3;     // ground bounces before it fizzles out
export const FLAME_RESTITUTION   = 0.55;  // bounce energy kept

// ── Boss rooms (dark reveal + the sucker fight) ───────────────────────────────
// One boss room is guaranteed per floor, as a far dead-end leaf. The room starts
// pitch dark with only the boss's silhouette visible; walking far enough in seals
// the entrance, plays the reveal (scream + light-up), and starts the fight. The
// far wall hides a floor-level exit (smoke-sealed until victory) that leads to a
// brand-new floor, Binding-of-Isaac style.
export const BOSS_TRIGGER_FRAC  = 0.42;  // how far across the room starts the reveal
export const BOSS_REVEAL_TIME   = 2.2;   // seconds of scream/shake while lights come up
export const BOSS_DARK_ALPHA    = 0.86;  // darkness overlay strength while unrevealed
export const BOSS_EXP_REWARD    = KISSER_EXP_REWARD * 1.5; // 1.5x the battle-room payout

// ── Sucker (boss) ─────────────────────────────────────────────────────────────
export const SUCKER_MAX_HP        = 2400;
export const SUCKER_TOUCH_DMG     = 26;
export const SUCKER_HOVER_TILES   = 2.2;  // hover height below the ceiling (tiles)
export const SUCKER_TRACK_SPEED   = 70;   // horizontal drift speed toward the player
// Attacks are picked randomly; with a ~3.5s attack this lands near one attack ~7s.
export const SUCKER_ATTACK_CD_MIN = 2.8;  // hover time between attacks (min)
export const SUCKER_ATTACK_CD_MAX = 4.2;  // hover time between attacks (max)

// Laser attack: repeated vertical strikes — a beat of stillness, a thin warning
// line at the player's position, then a quick bright beam (like green lightning).
export const LASER_STRIKES = 3;
export const LASER_PAUSE   = 0.55;  // beat between strikes
export const LASER_WARN    = 0.7;   // warning-line duration before the flash
export const LASER_FLASH   = 0.16;  // beam duration
export const LASER_W       = 22;    // beam width (px); the warning line is thinner
export const LASER_DMG     = 30;

// Plasma rush attack: the clip plays once; from the plasma_spawn frame on, lobbed
// plasma balls stream toward the player (arcing under gravity, exploding on impact).
export const SUCKER_PLASMA_DURATION = 3.2;   // total firing window
export const SUCKER_PLASMA_INTERVAL = 0.22;  // seconds between balls
export const ARC_PLASMA_GRAVITY     = 700;
export const ARC_PLASMA_TIME        = 0.9;   // nominal flight time to the player
export const ARC_PLASMA_SIZE       = 14;
export const ARC_PLASMA_DMG        = 16;    // direct hit
export const ARC_EXPLOSION_RADIUS  = 52;
export const ARC_EXPLOSION_DMG     = 18;    // splash on impact

// ── Sucker mini (spawned during the boss fight) ───────────────────────────────
// Flies at the player with acceleration-based movement (overshoots, loops back).
export const SUCKER_MINI_MAX_HP = 45;    // eyefly-like stats
export const SUCKER_MINI_ACCEL  = 520;
export const SUCKER_MINI_SPEED  = 250;
export const MINI_SPAWN_MIN     = 4.0;   // seconds between spawn waves (min)
export const MINI_SPAWN_MAX     = 8.0;   // seconds between spawn waves (max)

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
// A floor is a finite Binding-of-Isaac-style cluster of this many rooms.
export const FLOOR_ROOMS_MIN = 14;
export const FLOOR_ROOMS_MAX = 16;
export const TRANSITION_TIME = 0.45;    // seconds for the room-slide
export const VIEW_MARGIN = 1.08;        // >1 leaves a little space around the room

// World-units per repeat of the looping brick background. Keep it a common
// divisor of ROOM_W (1184) and ROOM_H (608) — i.e. a divisor of 32 — so the
// pattern stays seamless across adjacent rooms during transitions.
export const BG_TILE = 32;
