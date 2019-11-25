const User = require('../../models/user');
const FriendRequest = require('../../models/friend_request');
const matches = require('express').Router();
const ObjectId = require('mongoose').Types.ObjectId;

async function storeFriendRequest(receiver, sender, unread){
    const friendRequest = new FriendRequest({
        receiver,
        sender,
        unread
    });

    await friendRequest.save();
}


matches.get('/:id', async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await User.findById(userId);
        const matches = await Promise.all(user.matches.map(async (match) => {
            return User.findById(match);
        }));

        res.json(matches);
    } catch (err) {
        
    }
});

matches.post('/request', async (req, res) => {
    const cache = req.app.get('cache');
    const receiver = req.body.id;
    const senderUser = req.body.user_id;
    const socketId = cache.get(receiver);
    const socket = req.app.get('socketio');
    
    try {
        
        const user = await User.findById(senderUser);
        const receiverUser = await User.findById(receiver);

        if(user && receiverUser){
            let match = await FriendRequest.findOne({receiver, sender: senderUser});
            match = match || await FriendRequest.findOne({ receiver: senderUser, sender: receiver });

            if(match){
                res.statusCode = 409;
                res.send('Friend Request already sent!');
                return;
            }


            if(receiverUser.matches.indexOf(senderUser) != -1){
                res.statusCode = 406;
                res.send('You are already friends with him!');
                return;
            }
            if (socketId) {
                socket.to(socketId).emit('friend_request', senderUser);
                await storeFriendRequest(receiver, senderUser, false);
            } else {
                await storeFriendRequest(receiver, senderUser, true);
            }
        }else{
            res.statusCode = 404;
            res.send('User not found!');
            return;
        }
    } catch (err) {
        console.error(`Internal server error: ${err}`)
        res.statusCode = 500;
        res.json({ message: err });
        return;
    }

    res.send('Friend Request sent!');
});

matches.post('/accept', async (req, res) => {
    const cache = req.app.get('cache');
    const matchId = req.body.id;
    const socket = req.app.get('socketio');

    try {
        const match = await FriendRequest.findById(matchId);
        if (!match) {
            res.statusCode = 404;
            res.send('Match not found!');
            return;
        }

        const senderUser = await User.findById(match.sender);
        const receiverUser = await User.findById(match.receiver);

        senderUser.matches.push(receiverUser.id);
        receiverUser.matches.push(senderUser.id);
        const socketId = cache.get(receiverUser.id);


        if(socketId)
            socket.to(socketId).emit('friend_accepted', receiverUser);

        await User.findByIdAndUpdate(senderUser.id, senderUser);
        await User.findByIdAndUpdate(receiverUser.id, receiverUser);
        await FriendRequest.findByIdAndDelete(matchId);
        
    } catch (err) {
        res.statusCode = 500;
        res.json({ message: err });
    }

    res.send('Friend Accepted!');

});

module.exports = matches;