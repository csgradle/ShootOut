var express = require('express');

var app = express();
var server = app.listen(3000);

app.use(express.static('public'));

console.log("Shootout server up and running!");

var socket = require('socket.io');

var io = socket(server);

const MAP_RADIUS = 500;
let players = {};
let bullets = [];
let leaderboard = [];
let walls = [
    { name:'TL', x:-MAP_RADIUS+MAP_RADIUS*2/3, y:-MAP_RADIUS+MAP_RADIUS*2/3, d:MAP_RADIUS/4 },
    { name:'TR', x:-MAP_RADIUS+MAP_RADIUS*4/3, y:-MAP_RADIUS+MAP_RADIUS*2/3, d:MAP_RADIUS/4 },
    { name:'BL', x:-MAP_RADIUS+MAP_RADIUS*2/3, y:-MAP_RADIUS+MAP_RADIUS*4/3, d:MAP_RADIUS/4 },
    { name:'BR', x:-MAP_RADIUS+MAP_RADIUS*4/3, y:-MAP_RADIUS+MAP_RADIUS*4/3, d:MAP_RADIUS/4 }
];
let chats = [];
let playerCount;

setInterval(emitHeartbeat, 33); // 30FPS would be 33
setInterval(updateGame, 33/2);
function emitHeartbeat() {
    if(playerCount > 0) { 
        var data = {
            players, 
            bullets,
            leaderboard, 
            walls,
            chats
        };
        io.sockets.emit('heartbeat', data);
        
    }
}
function updateGame(){
    playerCount = Object.keys(players).length;
    if(playerCount > 0) { 
        
        for(let id in players) {
            let player = players[id];
            if(player.health == -100) continue;
            if(player.reloadCounter >= 0) {
                player.reloadCounter--;
                if(player.reloadCounter == 0) {
                    if(player.weapon == 0) {
                        player.ammo = 2;
                    }
                    if(player.weapon == 1) {
                        player.ammo = 12;
                    }
                    if(player.weapon == 2) {
                        player.ammo = 2;
                    }
                }
            }
            if(player.redTime > 0) {
                player.redTime-=0.5;
            } else if (player.health < 100){
                player.health += 0.1;
                if(player.health > 100) player.health = 100;
            }
            for(let i = 0; i < bullets.length; i++) {
                let bullet = bullets[i];
                if(bullet.id != id){
                    if(Math.abs(bullet.x - player.x) < 20 && Math.abs(bullet.y - player.y) < 20) {
                        if(Math.sqrt((player.x-bullet.x)*(player.x-bullet.x) + (player.y-bullet.y)*(player.y-bullet.y)) < 15) {
                            if(players[bullets[i].id].weapon == 0) 
                                player.health -= 10;
                            if(players[bullets[i].id].weapon == 1) 
                                player.health -= 20;
                            if(players[bullets[i].id].weapon == 2) 
                                player.health -= 80;
                            player.redTime = 20;
                            if(player.health <= 0) { // player killed by bullet
                                if(player.health != -100) {
                                    io.sockets.emit('playerDied', {player, killedBy:players[bullets[i].id]});
                                    players[bullets[i].id].kills++;
                                    let killerId = bullets[i].id;
                                    bullets.splice(i, 1);
                                    player.health = -100;
                                    for(let u = 0; u < leaderboard.length; u++) { // remove dead player and add it at end
                                        if(leaderboard[u].id == player.id) {
                                            leaderboard.splice(u, 1);
                                            leaderboard.push(new LbItem(player.id, player.username, 0));
                                            break;
                                        }
                                    }
                                    for(let u = 0; u < leaderboard.length; u++) { // move the killer player up the leaderboard
                                        if(leaderboard[u].id == killerId) {
                                            leaderboard[u].kills = players[killerId].kills;
                                            if(u != 0 && leaderboard[u].kills > leaderboard[u-1].kills) {
                                                for(let k = u; k > 0; k--) {
                                                    if(leaderboard[k].kills > leaderboard[k-1].kills) {
                                                        leaderboard.splice(k, 1);
                                                        leaderboard.splice(k-1, 0, new LbItem(killerId, players[killerId].username, players[killerId].kills));
                                                    } else {
                                                        break;
                                                    }
                                                }
                                            } 
                                            break;
                                        }
                                    }
                                    break;
                                }
                                player.health = -100;
                                
                            }
                            bullets.splice(i, 1);
                            i--;
                        }
                    }
                }
            }
        } 
        for(let i = 0; i < bullets.length; i++) {
            bullets[i].update();
            if(bullets[i].isDelete()) {
                bullets.splice(i, 1);
                i--;
            }
        }
        for(let i = 0; i < chats.length; i++){
            chats[i].life--;
            if(chats[i].life < 0) {
                chats.splice(i,1);
                i--;
            }
        }
    }
}

io.sockets.on('connection', 
    function(socket) {
        console.log('new connection: ' + socket.id)
        io.sockets.emit('newConnected', {id: socket.id});

        socket.on('createPlayer', function(data) {
            players[data.player.id]=data.player;
            
            io.sockets.emit('startClient', { id: socket.id, user: data.player });
            leaderboard.push(new LbItem(data.player.id, data.player.username, 0));
        });
        socket.on('updatePlayer', function(data) {
            
            let u = data.player;
            if(u.health == -100) return;
            u.ammo = players[u.id].ammo;
            u.health = players[u.id].health;
            u.reloadCounter = players[u.id].reloadCounter;
            u.redTime = players[u.id].redTime;
            u.kills = players[u.id].kills;
            players[u.id] = data.player;
                
        });
        socket.on('playerShoot', function(data) {
            if(players[data.id].health == -100) return;
            if(players[data.id].ammo > 0){
                if(players[data.id].weapon == 0) {
                    for(let n = 0; n < 10; n++) {
                        let r = 20+Math.random()*6-3;
                        let origin = {x:players[data.id].x+r*Math.cos(players[data.id].dir), y:players[data.id].y+r*Math.sin(players[data.id].dir)};
                        bullets.push(new Bullet(origin.x, origin.y, players[data.id].dir + Math.random()*0.3-0.15, 20, data.id));
                    }
                } 
                if(players[data.id].weapon == 1) {
                    let origin = {x:players[data.id].x+20*Math.cos(players[data.id].dir), y:players[data.id].y+20*Math.sin(players[data.id].dir)};
                    bullets.push(new Bullet(origin.x, origin.y, players[data.id].dir, 25, data.id));
                }
                if(players[data.id].weapon == 2) {
                    let origin = {x:players[data.id].x+20*Math.cos(players[data.id].dir), y:players[data.id].y+20*Math.sin(players[data.id].dir)};
                    bullets.push(new Bullet(origin.x, origin.y, players[data.id].dir, 40, data.id));
                }
                players[data.id].ammo--;
                players[data.id].reloadCounter = -1;
            }
        });
        socket.on('playerReload', function(data) {
            if(players[data.id].health == -100) return;
            if(players[data.id].reloadCounter = -1) {
                if(players[data.id].weapon == 0) 
                    players[data.id].reloadCounter = 30*2;
                if(players[data.id].weapon == 1) 
                    players[data.id].reloadCounter = 30*2;
                    if(players[data.id].weapon == 2) 
                    players[data.id].reloadCounter = 30*2;
                players[data.id].ammo = 0;
            }
        });
        socket.on('restartPlayer', function(data){
            if(players[data.player.id].health == -100) {
                players[data.player.id].x = randomPos();
                players[data.player.id].y = randomPos();
                players[data.player.id].dir = 0;
                players[data.player.id].health = 100;
                players[data.player.id].weapon = data.player.weapon;
                if(players[data.player.id].weapon == 0) 
                    players[data.player.id].ammo = 2;
                if(players[data.player.id].weapon == 1) 
                    players[data.player.id].ammo = 12;
                    if(players[data.player.id].weapon == 2) 
                    players[data.player.id].ammo = 2;
                players[data.player.id].reloadCounter = -1;
                players[data.player.id].redTime = 0;
                players[data.player.id].kills = 0;
                io.sockets.emit('playerRestarted', {user:players[data.player.id]});
            }
        });
        socket.on('playerChat', function(data) {
            chats.push({id:data.player.id, text:data.text, life:60*3});
        });
        socket.on('ping', function(data) {
            io.sockets.emit('pong', {id:data.id});
        });
        socket.on('disconnect', function(){
            console.log('client disconnected ' + socket.id);
            delete players[socket.id];
            playerCount = Object.keys(players).length;
            console.log('current player count: ' + playerCount);
            for(let i = 0; i < leaderboard.length; i++) {
                if(leaderboard[i].id == socket.id) {
                    leaderboard.splice(i, 1);
                    break;
                }
            }
        } );
    }
);


function Bullet(x, y, dir, speed, id) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = speed;
    this.id = id;
    this.life = 30;
    this.vx = speed*Math.cos(dir);
    this.vy = speed*Math.sin(dir);
    this.update = function() {
        this.x += this.vx*0.5;
        this.y += this.vy*0.5;
        this.life-=0.5;
    };
    this.isDelete = function() { 
        if (this.life < 0) {
            return true
        }
        if(this.x + 2.5 > MAP_RADIUS || this.x - 2.5 < -MAP_RADIUS || this.y + 2.5 > MAP_RADIUS || this.y - 2.5 < -MAP_RADIUS) {
            return true;
        }
        for(let i = 0; i < walls.length; i++) {
            if(dist(this.x, this.y, walls[i].x, walls[i].y) < walls[i].d/2 + 2.5) {
                return true;
            }
        }
        return false;
    };
}
function LbItem(id, username, kills) {
    this.id = id;
    this.username = username;
    this.kills = kills;
}
function dist(x1,y1,x2,y2) {
    return Math.sqrt((y2-y1)*(y2-y1) + (x2-x1)*(x2-x1));
}
function randomPos() {
    return Math.random()*MAP_RADIUS*2-MAP_RADIUS;
}