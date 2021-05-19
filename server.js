var express = require('express');

var app = express();
var server = app.listen(3000);

app.use(express.static('public'));

console.log("Shootout server up and running!");

var socket = require('socket.io');

var io = socket(server);

let players = {};
let bullets = [];
let leaderboard = [];
let playerCount;
setInterval(emitHeartbeat, 33); // 30FPS would be 33

function emitHeartbeat() {
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
                }
            }
            if(player.redTime > 0) {
                player.redTime--;
            } else if (player.health < 100){
                player.health += 0.2;
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
                            player.redTime = 20;
                            if(player.health <= 0) {
                                if(player.health != -100) {
                                    io.sockets.emit('playerDied', {player, killedBy:players[bullets[i].id].username});
                                    players[bullets[i].id].kills++;
                                    let killerId = bullets[i].id;
                                    bullets.splice(i, 1);
                                    player.health = -100;
                                    for(let u = 0; u < leaderboard.length; u++) {
                                        if(leaderboard[u].id == player.id) {
                                            leaderboard.splice(u, 1);
                                            leaderboard.push(new LbItem(player.id, player.username, 0));
                                            break;
                                        }
                                    }
                                    for(let u = 0; u < leaderboard.length; u++) {
                                        if(leaderboard[u].id == killerId) {
                                            if(u != 0 && leaderboard[u].kills > leaderboard[u-1].kills) {
                                                leaderboard.splice(u, 1);
                                                leaderboard.splice(u-1, 0, new LbItem(killerId, players[killerId].username, players[killerId].kills));
                                            } else {
                                                leaderboard[u].kills = players[killerId].kills;
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
        var data = {
            players, 
            bullets,
            leaderboard
        };
        io.sockets.emit('heartbeat', data);
        
    }
}

io.sockets.on('connection', 
    function(socket) {
        console.log('new connection: ' + socket.id)
        io.sockets.emit('newConnected', {id: socket.id});

        socket.on('createPlayer', function(data) {
            players[data.player.id]=data.player;
            // GIVE PLAYER A RANDOM STARTING POSITION
            // 
            // 
            // ASDFJALSKDJFKALSJDFLKJSDKFJAKSLDJFLKAJSDLKFJAKLSJDFLKASJDFKJKLASJDFKLJALSKDJF
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
                players[data.id].ammo = 0;
            }
        });
        socket.on('restartPlayer', function(data){
            if(players[data.player.id].health == -100) {
                players[data.player.id].x = 0;
                players[data.player.id].y = 0;
                players[data.player.id].dir = 0;
                players[data.player.id].health = 100;
                players[data.player.id].weapon = data.player.weapon;
                if(players[data.player.id].weapon == 0) 
                    players[data.player.id].ammo = 2;
                if(players[data.player.id].weapon == 1) 
                    players[data.player.id].ammo = 12;
                players[data.player.id].reloadCounter = -1;
                players[data.player.id].redTime = 0;
                players[data.player.id].kills = 0;
                io.sockets.emit('playerRestarted', {user:players[data.player.id]});
            }
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
    this.update = function() {
        this.x += speed*Math.cos(dir);
        this.y += speed*Math.sin(dir);
        this.life--;
    };
    this.isDelete = function() { return this.life < 0 };
}
function LbItem(id, username, kills) {
    this.id = id;
    this.username = username;
    this.kills = kills;
}