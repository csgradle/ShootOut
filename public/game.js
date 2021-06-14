//const destination = "http://localhost:3000";
const destination = "wss://shootout.koizura.me";

const colors = ['#262312', '#D9C99A', '#F2E1AE', '#BFA87E', '#0D0D0D', '#B30054', '#19B52C'];
var socket;
var GAMEMODE;
var fontMarker;
let latency, timeInfo;
let latestKilled = {name:"none", timer:0}
let isChat;
let fps = 0;
let activePlayers = 0;
let escapeCounter = 0;
const FRAME_DELAY = 2;
let MAP_RADIUS = 500;
const changelog = [
    {
        version:"1.0.0", 
        date:"5/19/21", 
        edits: ["First release"]
    },
    {
        version:"1.1.0", 
        date:"5/19/21", 
        edits: ["Added chat function", "Visual improvements"]
    },
    {
        version:"1.2.0", 
        date:"5/23/21", 
        edits: ["Published on cloud server", "Fixed connection and sockets"]
    },
    {
        version:"1.3.0", 
        date:"5/24/21", 
        edits: ["Buffed sniper", "Buffed standard", "Added anti-chat and name hacks", "Fixed leaderboard vulnerability", "Fixed sticky input issues"]
    },
    {
        version:"1.4.0", 
        date:"6/5/21", 
        edits: [
            "Changed FPS calculation", 
            "Patched and improved leaderboard code and display",
            "Fixed server-side websocket vulnerabilities", 
            "Added offline notification for when the server isn't working", 
            "Changed standard gun to spray gun", 
            "Fixed chat visibility on death",
            "Added dynamic map based on player count"
        ]
    },
    {
        version:"1.4.1", 
        date:"6/14/21", 
        edits: [
            "Added better auto-map-size",
            "Added player count display",
            "Added leaderboard display limit",
            "Added in-game escape option",
            "Added space to shoot",
            "decreased heal speed"
        ]
    },
];
let changelogindex = changelog.length-1;
const gunInfo = [
    { name:'shotgun', shootReload:5, reloadMax:2 },
    { name:'spray', shootReload:1, reloadMax:20 },
    { name:'sniper', shootReload:20, reloadMax:2 }
];
const keyCodes = {
    a:65,
    d:68,
    w:87,
    s:83,
    space:32,
    escape:27,
}
let nameInput, username = 'unnamed player', chatInput;
let disconnectTimer = 0;
function setup() {
    let canvas = createCanvas(1000,700);
    canvas.parent("game");
    background(colors[0]);
    loadHome();
    fontMarker = loadFont('./assets/MarkerFeltThin.ttf');
    frameRate(30);
    ping = 0;
    isChat = false;
    chatInput = createInput('');
    chatInput.hide();
    chatInput.parent("game");
    chatInput.position(width/2-150, height*1/2+100);
    chatInput.size(300);
    chatInput.id("chatInput")
    chatInput.input(function() {
        if(this.value().length > 24) {
            this.value(this.value().substring(0, 24));
        }
    });
    disconnectTimer = 0;
}
function loadHome() {
    GAMEMODE = 'HOME';
    nameInput = createInput(username);
    nameInput.parent("game");
    console.log(username);
    nameInput.value(username);
    nameInput.position(width/2-50, height*1/2+20);
    nameInput.size(100);
    nameInput.input(function() {
        if(this.value().length > 14) {
            this.value(this.value().substring(0, 14));
        }
    });
    nameInput.show();
    
    isChat = false;
    disconnectTimer = 0;
}
let gameStates = [];

let player;
let players = {};
let bullets = [];
let leaderboard = [];
let walls = [];
let chats = [];
let scroll = {x: 0, y:0};
let killedBy;
let gunEquipHome;
let weaponSelected = 0;
let highestStreak = 0;
function loadServer() {
    GAMEMODE='LOAD';
    username = nameInput.value();
    disconnectTimer = 0;
    nameInput.hide();
    console.log('sending connection...');
    socket = io.connect(destination);
    socket.on('newConnected', function(data){
        if(data.id == socket.id) {
            console.log('connected, now creating player');
            console.log(socket.id);
            socket.emit('createPlayer', { player:new Player(nameInput.value(), socket.id, random(-MAP_RADIUS, MAP_RADIUS), random(-MAP_RADIUS, MAP_RADIUS), 0, weaponSelected)});    
        }
    });
    
    socket.on('startClient', function(data) {
        if(data.id == socket.id) {
            player = (data.user);
            players[player.id] = player;
            gameStates = [];
            for(let i = 0; i < FRAME_DELAY; i++) {
                gameStates.push({players, bullets, leaderboard, walls, chats});
            }
            socket.on('heartbeat', tick);
            disconnectTimer = 0;
            loadGame();
        }
    });
    socket.on('pong', function(data){
        if(data.id == socket.id) {
            const newTime = new Date();
            ping =  newTime.getMilliseconds()-timeInfo.getMilliseconds();
            if(ping < 0) {
                ping = 1000+ping;
            }
            disconnectTimer = 0;
        }
    });
    socket.on('playerDied', function(data) {
        if(data.player.id == socket.id) {
            player = data.player;
            killedBy = data.killedBy.username;
            loadDead();
            isChat = false;
            chatInput.hide();
            document.getElementById("chatInput").blur();
        }
        if(data.killedBy.id == socket.id) {
            latestKilled.name = data.player.username;
            latestKilled.timer = 90;
        }
    });
}
function loadGame() {
    GAMEMODE='GAME';
    
    scroll = {x:0, y:0};
    gunReady = true;
    shootReload = gunInfo[player.weapon].shootReload;
    disconnectTimer = 0;
}
function loadDead() {
    GAMEMODE='DEAD';
    if(player.kills > highestStreak) {
        highestStreak = player.kills;
    }
    console.log('oops! you died!');
    isChat = false;
    keyup = false;
    keydown = false;
    keyleft = false;
    keyright = false;
}
function loadRestart() {
    GAMEMODE="LOAD";
    player.weapon = weaponSelected;
    socket.emit('restartPlayer', {player});
    socket.on('playerRestarted', function(data) {
        if(data.user.id == socket.id) {
            player.weapon = weaponSelected;
            player = data.user;
            loadGame();
        }
    }); 
}
function tick(data) {
    addGameState(data);
    let current = getGameState();
    players = current.players;
    bullets = current.bullets;
    walls = current.walls;
    leaderboard = current.leaderboard;
    chats = current.chats;
    player.health = players[player.id].health;
    player.ammo = players[player.id].ammo;
    player.reloadCounter = players[player.id].reloadCounter;
    player.redTime = players[player.id].redTime;
    player.kills = players[player.id].kills;
    
    MAP_RADIUS = data.MAP_RADIUS;

    socket.emit('updatePlayer', { player } );
    if(frameCount%30 == 0) {
        timeInfo = new Date();
        socket.emit('ping', { id:player.id });
    }
    disconnectTimer = 0;
    //
}
function getGameState() {
    if(gameStates.length > 0) {
        if(gameStates.length > FRAME_DELAY+1) {
            gameStates.splice(0, gameStates.length-FRAME_DELAY);
        }
        let first = gameStates[0];
        if(gameStates.length > 1) {
            gameStates.splice(0, 1);
        }
        return first;
    }
}
function addGameState(gameState) {
    gameStates.push(gameState);
}

function draw() {
    //if(isChat) chatInput.position(-150 + window.innerWidth/2,100+window.innerHeight*0.9/2);
    //if(GAMEMODE == "HOME") nameInput.position(-50 + window.innerWidth/2, 20 + window.innerHeight*0.9/2);
    fps += (getFrameRate()-fps)*0.1;
    background(colors[0]);
    if(GAMEMODE=='HOME') {
        // name box
        rectMode(CENTER);
        fill(colors[4]);
        stroke(colors[2]); strokeWeight(10);
        rect(width/2, height/2, 400, 140);

        // title
        textAlign(CENTER, CENTER);
        textFont(fontMarker);
        textSize(100);
        fill(colors[2]); noStroke();
        text("SHOOTOUT", width/2, height*1/4);

        // username
        textSize(50);
        text(nameInput.value(), width/2, height*1/2-20);

        // lower box
        fill(colors[4]);
        stroke(colors[2]); strokeWeight(10);
        rect(width/2, height/2+200, 300, 200);

        // instructions
        fill(colors[2]);
        textSize(20); noStroke();
        text("WASD - move\nclick - shoot\nR - reload\nSpace - chat", width/2, height/2+240);

        //bottom left
        fill(colors[2]);
        textSize(15);
        text("Server located in California\nMade by Koizura", width/2, 30);

        // play btn
        if(    mouseX > width/2-60     && mouseX < width/2+60
            && mouseY < height/2+150+20 && mouseY > height/2+150-20) {
            fill(colors[2]);
        } else { fill(colors[3]) };
        noStroke();
        rect(width/2, height/2+150, 120, 40);
        textSize(30);
        fill(colors[4]); noStroke();
        text("Play", width/2, height/2+150);
        
        drawWeaponSelection();
        drawChangelog();
    }
    if(GAMEMODE=='LOAD') {
        rectMode(CENTER);
        fill(colors[4]);
        stroke(colors[2]); strokeWeight(10);
        rect(width/2, height/2, 400, 140);

        textSize(50);
        text("Loading...", width/2, height*1/2);
        disconnectTimer++;
        if(disconnectTimer > 3*30) {
            GAMEMODE="OFFLINE";
        }
    }
    if(GAMEMODE=="GAME") {
        disconnectTimer++;
        if(disconnectTimer > 3*30) {
            GAMEMODE = "OFFLINE";
        }
        scroll.x += (player.x-width/2-scroll.x)*0.1;
        scroll.y += (player.y-height/2-scroll.y)*0.1;
        background(colors[4]);
        drawBullets();
        updatePlayer(player);
        drawPlayer(player);
        drawPlayers();
        drawMap();
        drawChats();
        drawLatestKill()
        if(player.redTime > 0){
            noFill();
            stroke(255,0,0, player.redTime/20*255/2);
            strokeWeight(100);
            rect(width/2,height/2,width,height);

            stroke(255,0,0, player.redTime/20*255);
            strokeWeight(50);
            rect(width/2,height/2,width,height);

        }

        // self player data
        fill(255); noStroke();
        textSize(50);
        text(player.username, width/2, height-90);
        textSize(30);
        
        text(player.kills+" kills", width/2, height-50);
        if(player.health > 9) {
            let h = player.health / 100 * 300;
            stroke(colors[5]);
            strokeWeight(15);
            line(width/2-150, height-25, width/2-150+h, height-25);
        }
        
        drawAmmo();
        // bottom left text
        fill(255); noStroke(); textSize(30);
        //text('ammo:'+player.ammo, 80, height-50);
        //text('reload:'+player.reloadCounter, 80, height-30);
        text('ping: ' + ping + 'ms', 80, height-70);
        text(round(fps) + ' FPS', 80, height-110);
        textSize(15);
        text(activePlayers + " Active players", 80, height-30);

        drawLeaderboard();
        if(escapeCounter > 0) {
            fill(255);
            textSize(30);
            text("Hold escape to return to home " + round(3-escapeCounter/30), width/2, height/4);
        }

        if(escapeCounter > 30*3) {
            loadHome();
            socket.disconnect();
        }
    }
    if(GAMEMODE=='DEAD') {
        disconnectTimer++;
        if(disconnectTimer > 3*30) {
            GAMEMODE= "OFFLINE";
        }
        // background
        background(colors[4]);
        drawBullets();
        drawPlayers();
        drawMap();
        drawChats();
        drawLatestKill()

        fill(255); noStroke();
        textSize(50);
        text(player.username, width/2, height-90);
        textSize(30);
        text("0 kills", width/2, height-50);
        if(player.health > 9) {
            let h = player.health / 100 * 300;
            stroke(colors[5]);
            strokeWeight(15);
            line(width/2-150, height-25, width/2-150+h, height-25);
        }
        drawAmmo();
        fill(255); noStroke(); textSize(30);
        text('ammo:'+player.ammo, 80, height-50);
        text('reload:'+player.reloadCounter, 80, height-30);
        text('ping: ' + ping + 'ms', 80, height-70);

        // fade
        let transparentCol = color(colors[0]);
        transparentCol.setAlpha(50);
        fill(transparentCol);
        noStroke();
        rect(width/2, height/2, width-30, height-30);

        // center text
        fill(colors[4]);
        stroke(colors[2]); strokeWeight(10);
        rect(width/2, height/2-30, 500, 200);
        noStroke();
        fill(255);
        textSize(40);
        text("Killed By: " + killedBy, width/2, height*1/2-80);
        textSize(30);
        text("kill streak: " + player.kills + "     highest: " + highestStreak, width/2, height*1/2-30);
        // playBtn
        if(    mouseX > width/2-60     && mouseX < width/2+60
            && mouseY < height/2+30+20 && mouseY > height/2+30-20) {
            fill(colors[2]);
        } else { fill(colors[3]) };
        noStroke();
        rect(width/2, height/2+30, 120, 40);
        textSize(30);
        fill(colors[4]); noStroke();
        text("Play", width/2, height/2+30);
        //homeBtn
        if(    mouseX > width/2-150-60     && mouseX < width/2-150+60
            && mouseY < height/2+30+20 && mouseY > height/2+30-20) {
            fill(colors[2]);
        } else { fill(colors[3]) };
        noStroke();
        rect(width/2-150, height/2+30, 120, 40);
        textSize(30);
        fill(colors[4]); noStroke();
        text("Home", width/2-150, height/2+30);


        drawLeaderboard()
        drawWeaponSelection();
        
    }
    if(GAMEMODE=="OFFLINE") {
        socket.disconnect();
        rectMode(CENTER);
        fill(colors[4]);
        stroke(colors[2]); strokeWeight(10);
        rect(width/2, height/2, 550, 250);
        strokeWeight(2);
        textSize(30);
        text("Server not connecting.\nServer could be turned off at the moment,\nor you might be offline.\nFeel free to message the creator,\nchicken#3413 on discord.", width/2, height*1/2);
    }
}

function drawPlayers() {
    activePlayers = 0;
    for(let key in players) {
        let p = players[key];
        if(p.health < 0) {
            strokeWeight(5);
            stroke(colors[3]) 
            let cntr = {x:p.x-scroll.x, y:p.y-scroll.y}
            line(cntr.x-30, cntr.y-30, cntr.x+30, cntr.y+30);
            line(cntr.x+30, cntr.y-30, cntr.x-30, cntr.y+30);
            continue;
        }

        activePlayers++;

        if(p.id == socket.id) continue;
        drawPlayer(p);
        
        // health bar
        if(p.health > 0) {
            let h = p.health / 100 * 60;
            noFill();
            stroke(colors[5]); strokeWeight(10); 
            line(p.x-30-scroll.x, p.y+30-scroll.y, p.x-30+h-scroll.x, p.y+30-scroll.y);
        }
        // username
        fill(255); noStroke();
        textSize(20);
        text(p.username, p.x-scroll.x, p.y-scroll.y-35);
    }
}
function drawChats() {
    let count = {};
    for(let i = chats.length - 1; i >= 0; i--) {
        let chat = chats[i];
        if(!(chat.id in players)) return;
        
        let p = players[chat.id];
        
        if(chat.id == socket.id) p = player;
        if(chat.id in count) {
            count[chat.id]++;
        } else {
            count[chat.id] = 0;
        }
        fill(colors[1]);
        noStroke();
        textSize(15);
        text(chat.text, p.x - scroll.x, p.y - scroll.y - 60 - 20*count[chat.id]);
    }
}
function drawBullets() {
    for(let i = 0; i < bullets.length; i++) {
        let p = {x: bullets[i].x-scroll.x, y: bullets[i].y-scroll.y};
        if(p.x < width+10 && p.x > -10 && p.y < height+10 && p.y > -10) {
            drawBullet(bullets[i]);
        }
    }
}
function drawLeaderboard() {
    for(let i = 0; i < leaderboard.length; i++) {
        if(i > 17) break;
        let c = color(colors[3]); c.setAlpha(150);
        fill(c);
        noStroke();
        rect(width-120, 40+i*30, 180, 26);
        fill(colors[0]);
        textSize(13);
        textAlign(LEFT, CENTER);
        text(leaderboard[i].username, width-120-80, 40+i*30);
        textAlign(RIGHT,CENTER);
        text(leaderboard[i].kills, width-40, 40+i*30);
        textAlign(CENTER,CENTER);
    }
}
function drawWeaponSelection() {
    rectMode(CENTER);
    fill(colors[4]);
    stroke(colors[2]); strokeWeight(10);
    rect(width-175, height-150, 250, 150);

    fill(colors[3]); noStroke(0);
    ellipse(width-175, height-150-35, 25,25);

    fill(colors[3]); noStroke(0);
    ellipse(width-175, height-150+40, 25,25);

    if(abs(mouseX - (width-175)) < 100 && abs(mouseY - (height-150)) < 75) {
        if(dist(mouseX, mouseY, width-175, height-150-35) < 25/2) {
            fill(colors[1]); noStroke(0);
            ellipse(width-175, height-150-35, 25,25);
        }
        if(dist(mouseX, mouseY, width-175, height-150+40) < 25/2) {
            fill(colors[1]); noStroke(0);
            ellipse(width-175, height-150+40, 25,25);
        }
    }

    

    textAlign(CENTER,CENTER);
    textSize(30);
    noFill();
    fill(colors[2]); noStroke();
    text(gunInfo[weaponSelected].name, width-175, height-150);
    fill(colors[4]); noStroke();
    text("^", width-175, height-150-30);
    push();
    translate(width-175, height-150+35);
    rotate(3.141592653);
    fill(colors[4]); noStroke();
    text("^",0,0);
    pop();
}

function Player(username, id, x, y, dir, weapon) {
    this.username = username;
    this.id = id;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.weapon = weapon;
    this.health = 100;
    this.ammo = gunInfo[weapon].reloadMax;
    this.reloadCounter = -1;
    this.redTime = 0;
    this.kills = 0;
}

function updatePlayer(user) {
    if(player.weapon == 1 && mouseIsPressed) {
        if(player.ammo > 0) {
            shoot = true;
        }
    }
    if(keyIsDown(keyCodes.space)) {
        if(player.ammo > 0 && player.weapon == 1) {
            shoot = true;
        }
    }
    if(keyIsDown(keyCodes.escape)) {
        escapeCounter++;
    } else {
        escapeCounter = 0;
    }
    let speed = 10;
    if(keyup) {
        user.y -= speed;
    }
    if(keydown) {
        user.y += speed;
    }
    if(keyleft) {
        user.x -= speed;
    }
    if(keyright) {
        user.x += speed;
    }
    boundPlayer(user);
    if(mouseX-(user.x-scroll.x) >= 0) {
        user.dir = atan((mouseY-(user.y-scroll.y))/(mouseX-(user.x-scroll.x)));
    } else {
        user.dir = 3.1415926535+atan((mouseY-(user.y-scroll.y))/(mouseX-(user.x-scroll.x)));
    }
    shootReload--;
    if(shoot &&shootReload<0) {
        socket.emit('playerShoot', { id:player.id } );
        shoot = false;
        shootReload=gunInfo[user.weapon].shootReload;
        
    }
    if(!keyIsDown(keyCodes.a)) keyleft = false;
    if(!keyIsDown(keyCodes.d)) keyright = false;
    if(!keyIsDown(keyCodes.w)) keyup = false;
    if(!keyIsDown(keyCodes.s)) keydown = false;
}

function boundPlayer(user) {
    if(player.x + 15 > MAP_RADIUS) {
        player.x = MAP_RADIUS - 15;
    }
    if(player.x - 15 < -MAP_RADIUS) {
        player.x = -MAP_RADIUS + 15;
    }
    if(player.y + 15 > MAP_RADIUS) {
        player.y = MAP_RADIUS - 15;
    }
    if(player.y - 15 < -MAP_RADIUS) {
        player.y = -MAP_RADIUS + 15;
    }
    for(let i = 0; i < walls.length; i++) {
        if(dist(player.x, player.y, walls[i].x, walls[i].y) < walls[i].d/2 + 15) {
            let k = atan2(player.y-walls[i].y, player.x-walls[i].x); // direction from wall to player;
            let m = 15 + walls[i].d/2; // distance
            player.x = walls[i].x + cos(k)*m;
            player.y = walls[i].y + sin(k)*m;
        }
    }
}
function drawMap() {
    rectMode(CENTER);
    noFill();
    stroke(colors[1]);
    strokeWeight(5);
    rect(0-scroll.x,0-scroll.y,MAP_RADIUS*2, MAP_RADIUS*2);
    for(let i = 0; i < walls.length; i++) {
        ellipse(walls[i].x-scroll.x, walls[i].y-scroll.y, walls[i].d, walls[i].d);
    }
}
function drawChangelog() {
    textAlign(CENTER);
    fill(colors[2]); noStroke(); textSize(30);
    text("Changelog", 120, 50);
    textSize(20);
    text("Version: " + changelog[changelogindex].version + "\t" + changelog[changelogindex].date, 120, 90);
    textSize(12);
    textAlign(LEFT);
    for(let i = 0; i < changelog[changelogindex].edits.length; i++) {
        let txt = "> " + changelog[changelogindex].edits[i];
        text(txt, 10, 120+i*20);
    }

    fill(colors[3]); noStroke();
    ellipse(120-80,50, 20,20);
    ellipse(120+80,50, 20,20);
    fill(colors[0]); noStroke();
    textSize(15);
    textAlign(CENTER);
    text("<", 120-80, 48);
    text(">", 120+80, 48);
    
}
function drawPlayer(user) {
    fill(colors[1]);
    noStroke();
    if(user.redTime > 0) {
        strokeWeight(user.redTime/4);
        stroke(255,0,0);
    }
    ellipse(user.x-scroll.x, user.y-scroll.y, 30,30);
    stroke(colors[1]);
    strokeWeight(5);
    line(user.x-scroll.x, user.y-scroll.y, user.x-scroll.x+cos(user.dir)*20, user.y-scroll.y+sin(user.dir)*20); 
}
function drawBullet(bullet) {
    fill(colors[3]);
    noStroke();
    ellipse(bullet.x-scroll.x, bullet.y-scroll.y, 5,5);
    ellipse(bullet.x-scroll.x -bullet.vx*0.5, bullet.y-scroll.y -bullet.vy*0.5, 4,4);
    ellipse(bullet.x-scroll.x -bullet.vx*1, bullet.y-scroll.y -bullet.vy*1, 3,3);
    ellipse(bullet.x-scroll.x -bullet.vx*1.5, bullet.y-scroll.y -bullet.vy*1.5, 2,2);
}
function drawLatestKill() {
    if(latestKilled.timer > 0) {
        noStroke();
        fill(255);
        textSize(30);
        text('You killed ' + latestKilled.name + "!", width/2, 150);
        latestKilled.timer--;
    } 
}
function drawAmmo() {
    if(player.weapon == 0) {
        fill(255);
        noStroke();
        textAlign(RIGHT,CENTER);
        textSize(30);
        text('Shotgun', width-20, height-40);
        textAlign(CENTER,CENTER);
        fill(0);
        stroke(colors[3]); strokeWeight(4);
        rect(width-40, height-100, 30, 50);
        rect(width-80, height-100, 30, 50);
        if(player.ammo > 0) {
            noStroke();
            fill(colors[6]);
            rect(width-40, height-100, 26, 50);
            if(player.ammo > 1) {
                rect(width-80, height-100, 26, 50);
            }
        } else {
            if(player.reloadCounter > 0) {
                let h = 50 - player.reloadCounter / 60 * 50;
                noStroke();
                fill(colors[5]);
                rect(width-40, height-100, 26, h);
                rect(width-80, height-100, 26, h);
            }
        }
    }
    if(player.weapon == 1) {
        fill(255);
        noStroke();
        textAlign(RIGHT,CENTER);
        textSize(30);
        text('Spray', width-20, height-40);
        textAlign(CENTER,CENTER);
        
        for(let i = 0; i < player.ammo; i++) {
            let p = getAmmoPos(i);
            let x = width-40-p.x*15;
            let y = height-80-p.y*20;
            noStroke(); fill(colors[3]);
            ellipse(x, y, 10, 10);
        }
        if(player.reloadCounter > 0) {
            let h = 20-floor(player.reloadCounter/60 * 20);
            for(let i = 0; i < h; i++) {
                let p = getAmmoPos(i);
                let x = width-40-p.x*15;
                let y = height-80-p.y*20;
                noStroke(); fill(colors[3]);
                ellipse(x, y, 10, 10);
            }
        } else {
            for(let i = 0; i < player.ammo; i++) {
                let p = getAmmoPos(i);
                let x = width-40-p.x*15;
                let y = height-80-p.y*20;
                noStroke(); fill(colors[3]);
                ellipse(x, y, 10, 10);
            }
        }
    }
    if(player.weapon == 2) {
        fill(255);
        noStroke();
        textAlign(RIGHT,CENTER);
        textSize(30);
        text('Sniper', width-20, height-40);
        textAlign(CENTER,CENTER);
        fill(0);
        stroke(colors[3]); strokeWeight(4);
        rect(width-40, height-100, 20, 60);
        rect(width-80, height-100, 20, 60);
        if(player.ammo > 0) {
            noStroke();
            fill(colors[6]);
            rect(width-40, height-100, 16, 60);
            if(player.ammo > 1) {
                rect(width-80, height-100, 16, 60);
            }
        } else {
            if(player.reloadCounter > 0) {
                let h = 60 - player.reloadCounter / 60 * 60;
                noStroke();
                fill(colors[5]);
                rect(width-40, height-100, 16, h);
                rect(width-80, height-100, 16, h);
            }
        }
    }
}
function getAmmoPos(ID) {
    x = floor(ID/4);
    y = ID%4;
    return {x,y};
}
let keyup, keydown, keyleft, keyright;

function keyPressed() {
    if(GAMEMODE=='GAME') {
        if(key=='w') keyup = true;
        if(key=='s') keydown = true;
        if(key=='a') keyleft = true;
        if(key=='d') keyright = true;
        if(key=='r' && player.reloadCounter==-1 && player.ammo < gunInfo[player.weapon].reloadMax) socket.emit('playerReload', {id:player.id});
        if(keyCode==ENTER) {
            if(!isChat) {
                isChat = true;
                chatInput.value('');
                
                chatInput.show();
                document.getElementById("chatInput").focus();
            } else {
                isChat = false;
                chatInput.hide();
                document.getElementById("chatInput").blur();
                if(chatInput.value().length > 0) {
                    console.log(chatInput.value());
                    socket.emit('playerChat', {player, text:chatInput.value()});
                }
            }
        }
        if(key==' ') {
            if(player.ammo > 0) {
                shoot = true;
            }
        }
    }
}
function keyReleased() {
    if(GAMEMODE=='GAME') {

        if(key=='w') keyup = false;
        if(key=='s') keydown = false;
        if(key=='a') keyleft = false;
        if(key=='d') keyright = false;
        if(key==' ' && player.reloadCounter == -1 && player.ammo < 1) socket.emit('playerReload', {id:player.id});
    }
}
let shoot = false;
let shootReload = 0;
function mouseReleased() {
    if(GAMEMODE=='GAME') {
        
        if(player.ammo > 0) {
            shoot = true;
        } else if (player.reloadCounter == -1) {
            socket.emit('playerReload', {id:player.id});
        }
    }
    if(GAMEMODE=='HOME' || GAMEMODE=='DEAD') {
        if(abs(mouseX - (width-175)) < 100 && abs(mouseY - (height-150)) < 75) {
            if(dist(mouseX, mouseY, width-175, height-150-35) < 25/2) {
                weaponSelected--;
                if(weaponSelected < 0) {
                    weaponSelected = gunInfo.length-1;
                }
            }
            if(dist(mouseX, mouseY, width-175, height-150+40) < 25/2) {
                weaponSelected++;
                if(weaponSelected >= gunInfo.length) {
                    weaponSelected = 0;
                }
            }
            
        }
    }
    if(GAMEMODE=="HOME") {
        if(mouseX<250 && mouseY < 80) {
            if(dist(mouseX, mouseY, 120-80, 50) < 10) {
                changelogindex--;
                if(changelogindex == -1) changelogindex = changelog.length-1;
            }
            if(dist(mouseX, mouseY, 120+80, 50) < 10) {
                changelogindex++;
                if(changelogindex == changelog.length) changelogindex = 0;
            }
        }
    }
}

function mouseClicked() {
    // home play btn
    if(    mouseX > width/2-60     && mouseX < width/2+60
        && mouseY < height/2+150+20 && mouseY > height/2+150-20 && GAMEMODE=='HOME') {
        
        loadServer();
    }
   // dead play btn
    if(    mouseX > width/2-60     && mouseX < width/2+60
        && mouseY < height/2+30+20 && mouseY > height/2+30-20 && GAMEMODE=='DEAD') {
        loadRestart();
    }
    // dead home btn
    if(    mouseX > width/2-150-60     && mouseX < width/2-150+60
        && mouseY < height/2+30+20 && mouseY > height/2+30-20 && GAMEMODE == 'DEAD') {
        loadHome();
        socket.disconnect();
    }
}