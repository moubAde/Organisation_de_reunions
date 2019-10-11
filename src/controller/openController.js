
const express = require('express')
const openController = express.Router()

const { sendMailToParticipants, sendMail } = require('../utils/helper')
const dao = require('../model/dao')

const tokenHandler = require('../authentification/tokenHandler')


//reunion open

openController.post('/reunions', (req, res) => {
    const reqBodyData = req.body.data
    if (reqBodyData == undefined) {
        res.status('400')
    }

    let date = reqBodyData.reunion.date 

    let reunion = {}
    reunion.admin = reqBodyData.reunion.admin
    reunion.title = reqBodyData.reunion.title
    reunion.place = reqBodyData.reunion.place
    reunion.note = reqBodyData.reunion.note
    reunion.date = date
    reunion.participant = reqBodyData.reunion.participant
    reunion.comment = []
    reunion.addComment = reqBodyData.reunion.addComment
    reunion.maxParticipant = reqBodyData.reunion.maxParticipant


    dao.createReunion(reunion, (reunionAdded) => {
        if (reunionAdded == undefined) {
            res.status('403').end()
        }
        else {
            const idReunion = reunionAdded._id

            const session = {
                sessionData: {
                    name: reunion.admin.name,
                    admin: true,
                    email: reunion.admin.email,
                    idReunion: idReunion
                }
            }

            try {
                const token = tokenHandler.createJWToken(session, true)
                let emailParticipants = []
                let emailData = {}
                for (let part of reunionAdded.participant) {
                    try {
                        const participantSession = {
                            sessionData: {
                                name: part.name,
                                admin: false,
                                email: part.email,
                                idReunion: reunionAdded._id,
                                idParticipant: part._id
                            }
                        }
                        const participantToken = tokenHandler.createJWToken(participantSession, true)
                        emailParticipants.push({
                            email: part.email,
                            token: participantToken
                        })
                    }
                    catch (error) {
                        res.status('500').end("hoho")
                    }
                }

                emailData.admin = reunionAdded.admin
                emailData.participants = emailParticipants

                sendMailToParticipants(emailData)
              
                sendMail(reunion.admin.email, 'Votre réunion', `http://localhost:4200/open-event/${token}`)

                console.log('emailData', emailData)
                res.json({
                    data: {
                        token: token
                    }
                })
            }
            catch (error) {
                // rollback database
                res.status('404').end()
            }
        }
    })
})

openController.get('/reunions/:token', (req, res) => {
    const token = req.params.token
    try {
        const session = tokenHandler.verifyJWTToken(token, true)

        if(session.sessionData.admin){
            dao.findReunion(session.sessionData.idReunion, (reunion) => {
                if ((reunion == null) || (reunion.admin.name != session.sessionData.name)) {
                    res.status('404').end()
                }
                else {
                    reunion.__v = null
                    res.json({
                        data: {
                            participant: session.sessionData,
                            reunion: reunion
                        }
                    })
                }
            })
        }
        else {
            dao.findReunion(session.sessionData.idReunion, (reunion) => {
                if (reunion == null) {
                    res.status('404').end()
                }
                else {
                    let participantExists = false 
                    reunion.participant.forEach(p => 
                        {
                            if(p.email == session.sessionData.email) {
                                participantExists = true
                                return
                            } 
                        
                        })
                    if(!participantExists){
                        res.status('401').end()
                    }
                    else{
                    reunion.__v = null
                    res.json({
                        data: {
                            participant: session.sessionData,
                            reunion: reunion
                        }
                    })
                }
                }
            })
        }
    }
    catch (error) {
        res.status('404').end()
    }
})

openController.put('/reunions/:id_reunion', (req, res) => {
    try {
        const reqBodyData = req.body.data
        const session = tokenHandler.verifyJWTToken(reqBodyData.token, true)
        const idReunion = req.params.id_reunion

        let reunion = {}
        reunion.id = session.sessionData.idReunion
        reunion.title = reqBodyData.reunion.title
        reunion.place = reqBodyData.reunion.place
        reunion.note = reqBodyData.reunion.note
        reunion.addComment = reqBodyData.reunion.addComment
        reunion.maxParticipant = reqBodyData.reunion.maxParticipant

        console.log('reunion', reqBodyData)

        const isAdmin = session.sessionData.admin

        //console.log("session", session.sessionData)
        if(session.sessionData.idReunion != idReunion){
            res.status('400').end()
        }
        else{
        if (isAdmin) {
            dao.updateReunion(reunion, (reunionUpdate) => {
                if (reunionUpdate == null) {
                    res.status('404').end()
                }
                else {
                    res.status('200').end()
                }
            })
        }
        else {
            res.status('401').end()
        }
    }
    }
    catch (error) {
        res.status('401').end("token ko")
    }
})

openController.delete('/reunions/:id_reunion/:token', (req, res) => {
    try {
        const token = req.params.token
        const session = tokenHandler.verifyJWTToken(token, true)

        const idReunion = session.sessionData.idReunion
        const isAdmin = session.sessionData.admin

        if(req.params.id_reunion != idReunion){
            res.status('400').end()
        }
        else{
            if (isAdmin) {
                res.status('200').end()
                dao.deleteReunion(idReunion, (reunionDelete) => {
                    if (reunionDelete == null) {
                        res.status('403').end()
                    }
                    else {
                        res.status('200').end()
                    }
                })
            }
            else {
                res.status('401').end()
            }

        }
    }
    catch (error) {
        res.status('401').end()
    }
})

openController.post('/reunions/:id_reunion/participants', (req, res) => {
    try {
        const reqBodyData = req.body.data
        const token = reqBodyData.token
        const session = tokenHandler.verifyJWTToken(token, true)

        if (session.sessionData.admin) {
            const idReunion = req.params.id_reunion

            let participant = {}
            participant.email = reqBodyData.participant.email
            participant.name = reqBodyData.participant.name

            dao.findParticipantWithEmail(idReunion, participant.email, (resFind) => {
                if (resFind.participant.length != 0) {
                    res.status('403').end('This email is already taken')
                }
                else {
                    dao.createParticipant(idReunion, participant, (participantAdded) => {
                        if (participantAdded == (undefined || null || [])) {
                            res.status('403').end('error')
                        }
                        else {
                            const participants = participantAdded.participant
                            const idParticipant = participants[participants.length - 1]._id
                            const session = {
                                sessionData: {
                                    name: participant.name,
                                    admin: false,
                                    email: participant.email,
                                    idReunion: idReunion,
                                    idParticipant: idParticipant
                                }
                            }
                            console.log('admin', participantAdded.admin)
                            try {
                                const token = tokenHandler.createJWToken(session, true)
                                const emailData = {
                                    admin: participantAdded.admin,
                                    participants: [
                                        {
                                            email: participant.email,
                                            token: token
                                        }
                                    ]
                                }

                                sendMailToParticipants(emailData)

                                const response = {
                                    data: {
                                        participant: {
                                            _id: session.sessionData.idParticipant
                                        },
                                        token: token
                                    }
                                }
                                res.json(response)
                            }
                            catch (error) {
                                res.status('500').end()
                            }
                        }
                    })
                }
            })
        }
        else {
            res.status('401')
        }
    }
    catch (error) {
        res.status('401')
    }
})

openController.put('/reunions/:id_reunion/participants/:id_participant', (req, res) => {
    try {
        const reqBodyData = req.body.data
        let token = reqBodyData.token
        let session = tokenHandler.verifyJWTToken(token, true)

        if (session.sessionData.idReunion == req.params.id_reunion) {
            
            const idReunion = req.params.id_reunion
            let participant = {}
            participant.id = req.params.id_participant
            participant.email = session.sessionData.email
            participant.name = reqBodyData.participant.name

            if (session.sessionData.admin) {
                dao.findParticipant(idReunion, participant.id, (resFind) => {
                    if (resFind.participant.length == 0) {
                        res.status('404').end()
                    }
                    else {
                        dao.updateParticipant(participant, (resUpdate) => {
                            if(resUpdate == {}){
                                res.status('500').end()
                            }
                            else{
                                session = {
                                    sessionData: {
                                        name: participant.name,
                                        admin: false,
                                        email: session.sessionData.email,
                                        idReunion: idReunion,
                                        idParticipant: participant.id
                                }
                                }
                            try {
                                const newToken = tokenHandler.createJWToken(session, true)
                                const emailData = {
                                    admin: resUpdate.admin,
                                    participants: [
                                        {
                                            email: participant.email,
                                            token: newToken
                                        }
                                    ]
                                }
    
                                sendMailToParticipants(emailData)
    
                                res.json({
                                    data: {
                                        token: newToken
                                    }
                                })
                            }
                            catch (error) {
                                res.end('500')
                            }

                            }
                        })  
                    }
                })
            }
            else {
                if (session.sessionData.idParticipant != participant.id) {
                    res.status('401').end()
                }
                else {
                    dao.findParticipant(idReunion, participant.id, (resFind) => {
                        if (resFind.participant.length == 0) {
                            res.status('404').end()
                        }
                        else {
                            dao.updateParticipant(participant, (resUpdate) => {
                                if(resUpdate == {}){
                                    res.status('500').end()
                                }
                                else{
                                    session = {
                                        sessionData: {
                                            name: participant.name,
                                            admin: false,
                                            email: session.sessionData.email,
                                            idReunion: idReunion,
                                            idParticipant: participant.id
                                    }
                                    }
                                try {
                                    const newToken = tokenHandler.createJWToken(session, true)
                                    const emailData = {
                                        admin: resUpdate.admin,
                                        participants: [
                                            {
                                                email: participant.email,
                                                token: newToken
                                            }
                                        ]
                                    }
        
                                    sendMailToParticipants(emailData)
        
                                    res.json({
                                        data: {
                                            token: newToken
                                        }
                                    })
                                }
                                catch (error) {
                                    res.end('500')
                                }
    
                                }
                            })  
                        }
                    })
                }
            }
        }
        else {
            res.status('401')
        }
    }
    catch (error) {
        res.status('401')
    }
})

openController.delete('/reunions/:id_reunion/participants/:id_participant/:token', (req, res) => {
    try {
        const reqBodyData = req.body.data
        const token = req.params.token
        const session = tokenHandler.verifyJWTToken(token, true)

        if (session.sessionData.idReunion == req.params.id_reunion) {
            const idReunion = req.params.id_reunion
            const idParticipant = req.params.id_participant

            if (session.sessionData.admin) {
                dao.deleteParticipant(idReunion, idParticipant, (resDelete) => {
                    console.log('resDelete', resDelete)
                    if (resDelete == null) {
                        res.status('404').end()
                    }
                    else {
                        res.status('200').end()
                    }
                })
            }
            else {
                dao.findParticipant(idReunion, idParticipant, (resFind) => {
                    if (resFind.participant.length == 0) {
                        res.status('404').end()
                    }
                    else {
                        if (resFind.participant[0]._id == session.sessionData.idParticipant) {
                            dao.deleteParticipant(idReunion, session.sessionData.idParticipant, (resDelete) => {
                                if (resDelete == null) {
                                    res.status('404').end()
                                }
                                else {
                                    res.status('200').end()
                                }
                            })
                        }
                        else {
                            res.status('401').end()
                        }
                    }
                })
            }
        }
        else {
            res.status('401').end()
        }
    }
    catch (error) {
        res.status('401').end()
    }
})

openController.post('/reunions/:id_reunion/comments', (req, res) => {
    try {
        const reqBodyData = req.body.data
        const token = reqBodyData.token
        const session = tokenHandler.verifyJWTToken(token, true)
        
        const idReunion = req.params.id_reunion
        if (idReunion == session.sessionData.idReunion) {
            let comment = {}
            comment.name = session.sessionData.name
            comment.email = session.sessionData.email
            comment.text = reqBodyData.comment.text

            dao.createComment(idReunion, comment, (resCreate) => {
                if (resCreate == {}) {
                    res.status('304').end()
                }
                else {
                    res.status('200').end()
                }
            })
        }
        else {
            res.status('401').end()
        }
    }
    catch (error) {
        res.status('401').end()
    }
})

openController.put('/reunions/:id_reunion/comments/:id_comment', (req, res) => {
    try {
        const reqBodyData = req.body.data
        const token = reqBodyData.token
        const session = tokenHandler.verifyJWTToken(token, true)
        const idReunion = req.params.id_reunion

        if (idReunion == session.sessionData.idReunion) {
            let comment = {}
            comment.id = req.params.id_comment
            comment.name = session.sessionData.name
            comment.text = reqBodyData.comment.text
            comment.email = session.sessionData.email

            dao.findComment(idReunion, comment.id, (resFind) => {
                if (resFind.comment.length == 0) {
                    res.status('404').end()
                }
                else {
                    if (resFind.comment[0].email != comment.email) {
                        res.status('403').end()
                    }
                    else {
                        dao.updateComment(comment, (resUpdate) => {
                            if (resUpdate == {}) {
                                res.status('403').end()
                            }
                            else {
                                res.status('200').end()
                            }
                        })
                    }
                }
            })
        }
        else {
            res.status('401').end()
        }
    }
    catch (error) {
        res.status('401').end()
    }
})

openController.delete('/reunions/:id_reunion/comments/:id_comment/:token', (req, res) => {
    try {
        const token = req.params.token
        const session = tokenHandler.verifyJWTToken(token, true)

        const idReunion = req.params.id_reunion
        const idComment = req.params.id_comment

        if (session.sessionData.idReunion = idReunion) {
            dao.findComment(idReunion, idComment, (resFind) => {
                console.log(resFind)
                if (resFind.comment.length == 0) {
                    res.status('404').end()
                }
                else {
                    if (session.sessionData.admin) {
                        dao.deleteComment(idReunion, idComment, (resDelete) => {
                            if (resDelete == null) {
                                res.status('304').end()
                            }
                            else {
                                res.status('200').end()
                            }
                        })
                    }
                    else if (session.sessionData.email == resFind.comment[0].email) {
                        dao.deleteComment(session.sessionData.idReunion, idComment, (resDelete) => {
                            if (resDelete == null) {
                                res.status('304').end()
                            }
                            else {
                                res.status('200').end()
                            }
                        })
                    }
                    else {
                        res.status('401').end()
                    }
                }
            })
        }
        else {
            res.status('401').end()
        }
    }
    catch (error) {
        res.status('401').end()
    }
})

// Admin
openController.put('/reunions/:id_reunion/admin', (req, res) => {
    if(req.body.data == undefined){
        res.status('400').end()
    }
    else{
        try{
            const reqBodyData = req.body.data
            const session = tokenHandler.verifyJWTToken(reqBodyData.token, true)
            if(session.sessionData.idReunion != req.params.id_reunion){
                res.status('400').end('Bad Reunion')
            }
            else{
                dao.updateAdmin(session.sessionData.idReunion, reqBodyData.admin, (resUpdate) => {
                    if(resUpdate == null){
                        res.status('404').end()
                    }
                    else{
                        const newSession = {
                            sessionData: {
                                idReunion: session.sessionData.idReunion,
                                email: session.sessionData.email,
                                admin: true,
                                name: resUpdate.admin.name
                            }
                        }
                        try{
                            const newToken = tokenHandler.createJWToken(newSession, true)
                            sendMail(session.sessionData.email, "Votre nouveau lien d'accès", `http://localhost:4200/open-event/${newToken}`)
                            res.json(
                                {
                                    data:{
                                        token: newToken
                                    }
                                }
                            )
                        }
                        catch(error){
                            res.status('500').end()
                        }
                    }
                })
            }
        }
        catch(error){
            res.status('400').end('Bad Token')
        }
    }
})


//Dates
openController.post('/reunions/:id_reunion/dates', (req, res) =>{
    if(req.body.data == undefined){
        res.status('400').end()
    }
    else{
        try{
            const reqBodyData = req.body.data
            console.log(reqBodyData)
            const session = tokenHandler.verifyJWTToken(reqBodyData.token, true)
            if(session.sessionData.idReunion != req.params.id_reunion){
                res.status('400').end('Bad Reunion')
            }
            else{
                console.log('hello')
                dao.createDate(session.sessionData.idReunion, reqBodyData.date, (resAdd) => {
                    console.log('resAdd', resAdd)
                    res.status('200').end()
                })
            }
        }
        catch(error){
            res.status('400').end('Bad Token')
        }
    }
})

openController.delete('/reunions/:id_reunion/dates/:id_date/:token', (req, res) =>{
        try{
            const session = tokenHandler.verifyJWTToken(req.params.token, true)
            if(session.sessionData.idReunion != req.params.id_reunion){
                res.status('400').end('Bad Reunion')
            }
            else{
                dao.deleteDate(session.sessionData.idReunion, req.params.id_date, (resDelete) => {
                    if(resDelete== null) {
                        res.status('403').end()
                    }
                    else{
                        res.status('200').end()
                    }
                })
            }
        }
        catch(error){
            res.status('400').end('Bad Token')
        }
})

module.exports = openController