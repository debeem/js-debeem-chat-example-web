import {
	ChatMessage, ClientConnect,
	ClientReceiveMessageCallback,
	ClientRoom,
	ClientRoomLatestMessage,
	JoinRoomRequest,
	LeaveRoomRequest,
	LeaveRoomResponse,
	MessageType,
	ResponseCallback,
	SendMessageRequest,
	VaChatRoomEntityItem
} from "debeem-chat-client";
import React from "react";
import _ from "lodash";
import "./ChatMessageList.css";
import { PopupInvitation } from "../PopupInvitation/PopupInvitation";
import { ChatRoomEntityItem } from "debeem-chat-client";
import { UserService } from "../../services/UserService";
import { LatestMessageService } from "../../services/LatestMessageService";
import { MessageService } from "../../services/MessageService";
import { DecryptedMessageList } from "../../models/DecryptedMessageList";


export interface LastTimestamp
{
	//
	//	key : roomId
	//	value : timestamp
	//
	[ key : string ] : number;
}

export interface ChatMessageListProps
{
	serverUrl : string;
	callbackOnMessageArrived : () => void;
}

export interface ChatMessageListState
{
	isPageActive : boolean;

	serverUrl : string;
	roomId : string;
	roomItem : ChatRoomEntityItem;
	userId : number;	//	current user id

	loading : boolean;
	value : string;
	messages : Array<ChatMessage>;
}

/**
 * 	@class
 */
export class ChatMessageList extends React.Component<ChatMessageListProps, ChatMessageListState>
{
	initialized : boolean = false;
	messagesEnd : any = null;

	refPopupInvitation : React.RefObject<any>;
	refPopupJoin : React.RefObject<any>;

	userService ! : UserService;
	messageService ! : MessageService;
	latestMessageService ! : LatestMessageService;

	/**
	 * 	...
	 */
	clientConnect ! : ClientConnect;
	clientRoom ! : ClientRoom;
	clientRoomLatestMessage ! : ClientRoomLatestMessage;

	chatMessageList : Array<ChatMessage> = [];
	oldestTimestamp : LastTimestamp = {};


	constructor( props : any )
	{
		if ( ! _.isString( props.serverUrl ) || _.isEmpty( props.serverUrl ) )
		{
			throw new Error( `invalid serverUrl` );
		}
		if ( ! _.isFunction( props.callbackOnMessageArrived ) )
		{
			throw new Error( `invalid props.callbackOnMessageArrived` );
		}

		//	...
		super( props );
		this.state = {
			isPageActive : false,
			serverUrl : props.serverUrl,
			roomId : ``,
			roomItem : {} as ChatRoomEntityItem,
			userId : 1,

			messages : [],
			loading : false,
			value : ''
		};

		//	...
		console.log( `🚀🚀🚀🚀🚀🚀 will connect server: ${ this.state.serverUrl }` );
		this.clientConnect = new ClientConnect( this.state.serverUrl, this.receiveMessageCallback );
		this.clientRoom = new ClientRoom();
		this.clientRoomLatestMessage = new ClientRoomLatestMessage();

		//	...
		this.refPopupInvitation = React.createRef();
		this.refPopupJoin = React.createRef();

		//	...
		this.userService = new UserService();
		this.messageService = new MessageService( this.clientConnect );
		this.latestMessageService = new LatestMessageService( this.clientConnect );

		//	...
		this._onVisibilityChange = this._onVisibilityChange.bind( this );
		this.onChatMessageListScroll = this.onChatMessageListScroll.bind( this );

		this.onClickJoinRoom = this.onClickJoinRoom.bind( this );
		this.onClickLeaveRoom = this.onClickLeaveRoom.bind( this );
		this.onClickSendMessage = this.onClickSendMessage.bind( this );
		this.onClickLoadMore = this.onClickLoadMore.bind( this );
		this.onInputKeyDown = this.onInputKeyDown.bind( this );
		this.onClickInvitation = this.onClickInvitation.bind( this );
		this.onClickJoin = this.onClickJoin.bind( this );
		this.onInputValueChanged = this.onInputValueChanged.bind( this );
	}

	/**
	 * 	callback function of receiveMessage
	 *	@param message		{SendMessageRequest}
	 *	@param [callback]	{( ack : any ) => void}
	 */
	receiveMessageCallback : ClientReceiveMessageCallback = async ( message : SendMessageRequest, callback ? : ( ack : any ) => void ) =>
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				console.log( `ClientReceiveMessageCallback received a message: `, message );
				if ( ! _.isObject( message ) || ! _.has( message, 'payload' ) )
				{
					return reject( `receiveMessageCallback :: invalid message` );
				}

				const walletObj = this.userService.getWallet();
				if ( ! walletObj )
				{
					return reject( `receiveMessageCallback :: failed to get wallet` );
				}

				/**
				 * 	current room
				 */
				if ( message.payload.roomId === this.state.roomId )
				{
					const decrypted : boolean = await this.handleArrivedMessageList( message.payload.roomId, [ message ] ) > 0;
					this.scrollToBottom();

					//
					//	Send feedback
					//
					// const sentByMe = walletObj.address.trim().toLowerCase() === message.payload.wallet.trim().toLowerCase();
					// if ( MessageType.USER === message.payload.messageType &&
					// 	! sentByMe )
					// {
					// 	await this.messageService.sendMessage
					// 	(
					// 		message.payload.roomId,
					// 		MessageType.SYSTEM, {
					// 		hash : message.payload.hash,
					// 		read : true,
					// 		decrypted : decrypted
					// 	} );
					// }
				}
				if ( _.isFunction( callback ) )
				{
					callback( 200 );
				}

				/**
				 * 	count the number of unread messages in all rooms
				 */
				await this.latestMessageService.countMessage( message.payload.roomId );
				this.props.callbackOnMessageArrived();

				//	...
				resolve();
			}
			catch ( err )
			{
				reject( err );
			}
		});
	}

	componentDidUpdate()
	{
		//this._scrollToBottom();
	}

	componentDidMount()
	{
		if ( this.initialized )
		{
			console.log( `🍔 componentDidMount, already initialized` );
			return;
		}
		this.initialized = true;

		//	add event handler
		document.addEventListener( 'visibilitychange', this._onVisibilityChange );

		//	...
		this.initUser();

		//	...
		this.backgroundRefresh().then( res =>
		{
			console.log( `))) background refresh is started` );
		} ).catch( err =>
		{
			console.error( `### failed to start the background refresh` );
		} );

		//	...
		console.log( `🍔 componentDidMount` );
	}

	componentWillUnmount()
	{
		document.removeEventListener( 'visibilitychange', this._onVisibilityChange );
	}

	private initUser()
	{
		const userId : number = this.userService.getUserId();
		this.setUser( userId );
	}


	public setUser( userId : number )
	{
		this.setState( {
			userId : userId,
		} );

		this.userService.changeUser( userId );
	}

	public async asyncJoinChatRoom( roomId : string ) : Promise<any>
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				this.clientConnect.joinRoom( {
					roomId : roomId
				} as JoinRoomRequest, ( response : any ) : void =>
				{
					//console.log( `💎 join room response: `, response );
					resolve( response );
				} );
			}
			catch ( err )
			{
				reject( err );
			}
		} );
	}

	public async asyncLoad( roomId : string ) : Promise<boolean>
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				const errorRoomId : string | null = VaChatRoomEntityItem.isValidRoomId( roomId );
				if ( null !== errorRoomId )
				{
					return reject( errorRoomId );
				}

				const walletObj = this.userService.getWallet();
				if ( ! walletObj )
				{
					return reject( `asyncLoad :: failed to get wallet` );
				}

				console.log( `will queryRoom ${ walletObj.address }.${ roomId }` );
				const roomItem : ChatRoomEntityItem | null = await this.clientRoom.queryRoom( walletObj.address, roomId );
				if ( ! roomItem )
				{
					return reject( `room not found` );
				}

				console.log( `🌈 asyncLoad roomItem :`, roomItem );

				//
				//	initialize member variables
				//
				this.chatMessageList = [];
				delete this.oldestTimestamp[ roomId ];
				this.setState( {
					loading : true,
					roomId : roomItem.roomId,
					roomItem : roomItem,
					messages : [],
				} );
				const _response : any = await this.asyncJoinChatRoom( roomId );

				//	...
				await this.loadMessageList( roomId );
				this.scrollToBottom();

				//	...
				this.setState( {
					loading : false
				} );
				resolve( true );
			}
			catch ( err )
			{
				reject( err );
			}
		} );
	}

	private async loadMessageList( roomId : string ) : Promise<number>
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				const errorRoomId : string | null = VaChatRoomEntityItem.isValidRoomId( roomId );
				if ( null !== errorRoomId )
				{
					return reject( errorRoomId );
				}

				const walletObj = this.userService.getWallet();
				if ( ! walletObj )
				{
					return reject( `_asyncLoadQueueMessage :: failed to get wallet` );
				}

				const startTimestamp = 0;
				let endTimestamp = -1;
				const pageSize = 10;
				let pageNo = 1;

				if ( _.isNumber( this.oldestTimestamp[ roomId ] ) )
				{
					endTimestamp = this.oldestTimestamp[ roomId ];
					if ( endTimestamp > 1 )
					{
						//	to exclude the current record
						endTimestamp--;
					}
				}
				const messageList : Array<SendMessageRequest> = await this.messageService.pullMessage( roomId, startTimestamp, endTimestamp, pageNo, pageSize );
				//console.log( `🍒🍒🍒 messageList by pullMessage :`, messageList );

				/**
				 * 	handle arrived message list
				 */
				const arrivedCount : number = await this.handleArrivedMessageList( roomId, messageList );
				//console.log( `🍔🍔🍔 arrivedCount :`, arrivedCount );
				if ( arrivedCount > 0 )
				{
					/**
					 * 	count the number of unread messages in all rooms
					 */
					await this.latestMessageService.countMessage( roomId );
					this.props.callbackOnMessageArrived();
				}

				//	...
				resolve( arrivedCount );
			}
			catch ( err )
			{
				reject( err );
			}
		} );
	}

	/**
	 *	@param roomId		{string}
	 *	@param messageList	{Array<SendMessageRequest>}
	 *	@returns {Promise<number>}
	 *	@private
	 */
	private handleArrivedMessageList( roomId : string, messageList : Array<SendMessageRequest> ) : Promise<number>
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				const errorRoomId : string | null = VaChatRoomEntityItem.isValidRoomId( roomId );
				if ( null !== errorRoomId )
				{
					return reject( `${ this.constructor.name }.handleArrivedMessageList :: ${ errorRoomId }` );
				}

				//
				//	decrypt the message list
				//
				const decryptedMessageList : DecryptedMessageList | null = await this.messageService.decryptMessageList( messageList );
				if ( null !== decryptedMessageList )
				{
					//
					//	pick up the oldest for the next querying
					//
					if ( undefined === this.oldestTimestamp[ roomId ] ||
						decryptedMessageList.oldest.timestamp < this.oldestTimestamp[ roomId ] )
					{
						//	save the older timestamp
						this.oldestTimestamp[ roomId ] = decryptedMessageList.oldest.timestamp;
					}

					//
					//	pick up the latest
					//
					await this.latestMessageService.storeLatestMessage( roomId, decryptedMessageList.latest );

					//
					//	update list
					//
					this.chatMessageList = this.chatMessageList.concat( decryptedMessageList.list );

					/**
					 * 	sort the decrypted message list by .timestamp ASC
					 */
					this.chatMessageList.sort( ( a : ChatMessage, b : ChatMessage ) => a.timestamp - b.timestamp );

					this.setState( {
						messages : this.chatMessageList
					} );

					return resolve( decryptedMessageList.list.length );
				}

				resolve( 0 );
			}
			catch ( err )
			{
				reject( err );
			}
		} );
	}


	private _onVisibilityChange()
	{
		//
		//	todo
		//	not working properly
		//
		this.setState( {
			isPageActive : ! document.hidden
		} );

		console.log( `🌈 isPageActive:`, this.state.isPageActive );
	}

	private scrollToBottom()
	{
		//this.messagesEnd.scrollIntoView({ behavior: "smooth" });
	}

	private onChatMessageListScroll( e : any )
	{
		const scrollTop = e.target.scrollTop;
		if ( 0 === scrollTop )
		{
			console.log( `🍄 handleScroll : at top` );
		}
	}

	onClickLoadMore( e : any )
	{
		e.preventDefault();
		if ( null !== VaChatRoomEntityItem.isValidRoomId( this.state.roomId ) )
		{
			throw new Error( `invalid this.state.roomId` );
		}

		this.loadMessageList( this.state.roomId ).then( loaded =>
		{
			//this._scrollToBottom();

		} ).catch( err =>
		{
			console.error( err );
		} );
	}

	onClickJoinRoom( e : any )
	{
		e.preventDefault();
	}

	onClickLeaveRoom( e : any )
	{
		e.preventDefault();
		const callback : ResponseCallback = ( response : LeaveRoomResponse ) : void =>
		{
			console.log( `🌶️ leave room response: `, response );
		};
		this.clientConnect.leaveRoom( {
			roomId : this.state.roomId
		} as LeaveRoomRequest, callback );
	}


	/**
	 * 	background refresh
	 *	@private
	 */
	private async backgroundRefresh()
	{
		await this.latestMessageService.countMessage();
		await this.activateAllRooms();
	}

	/**
	 * 	try to activate all rooms continuously in the background
	 *	@private
	 */
	private async activateAllRooms()
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				const walletObj = this.userService.getWallet();
				if ( ! walletObj )
				{
					return reject( `_activateAllRooms :: invalid walletObj null` );
				}

				//	读取所有房间的 last timestamp
				const rooms : Array<ChatRoomEntityItem> = await this.clientRoom.queryRooms( walletObj.address );
				if ( Array.isArray( rooms ) )
				{
					for ( const room of rooms )
					{
						const errorRoom = VaChatRoomEntityItem.validateChatRoomEntityItem( room );
						if ( null !== errorRoom )
						{
							continue;
						}

						await this.asyncJoinChatRoom( room.roomId );
					}
				}

				//	start the next tick
				setTimeout( async () =>
				{
					await this.activateAllRooms();

				}, 60 * 1000 );

				//	...
				resolve( true );
			}
			catch ( err )
			{
				reject( err );
			}
		} );
	}


	onClickSendMessage( e : any )
	{
		e.preventDefault();
		this.messageService.sendMessage( this.state.roomId, MessageType.USER, this.state.value ).then( res =>
		{
			console.log( `onClickSendMessage :`, res );
			this.setState( { value : '' } );
			this.scrollToBottom();

		} ).catch( err =>
		{
			console.error( `onClickSendMessage :`, err );
		} )
	}

	onInputValueChanged( e : any )
	{
		this.setState( { value : e.target.value } );
	}

	onInputKeyDown( e : any )
	{
		if ( 'Enter' === e.key )
		{
			this.onClickSendMessage( e );
		}
	}

	onClickInvitation()
	{
		const childInstance = this.refPopupInvitation.current;
		childInstance.togglePopup( this.state.roomId );
	}

	onClickJoin()
	{
		const childInstance = this.refPopupJoin.current;
		childInstance.togglePopup();
	}


	render()
	{
		return (
			<div>
				<div className="RoomIdDiv sticky-top">
					roomId: { this.state.roomId }
				</div>
				<div className="LoadMreDiv">
					<a onClick={ this.onClickLoadMore } className="LoadMoreButton">Older</a>
				</div>
				<div className="ChatMessageList"
				     style={ { minHeight : '100vh', overflowY : 'scroll' } }
				     onScroll={ this.onChatMessageListScroll }
				>
					{ this.state.messages.map( ( item : any ) =>
						<div key={ item.hash }>
							{ item.fromName } / { item.timestamp }[{ new Date( item.timestamp ).toLocaleString() }]
							<br/>
							hash: { item.hash }
							<br/>
							{ item.body }
							<hr/>
						</div>
					) }
				</div>
				<div style={ { height : '30px' } }></div>

				{ this.state.loading &&
					<div className="BarDiv sticky-bottom">Loading, please wait ...</div>
				}
				{ ( ! this.state.loading && '' !== this.state.roomId ) &&
					<div className="BarDiv sticky-bottom">
						{/*<button onClick={ this.onClickJoinRoom }>Join</button>*/ }
						{/*&nbsp;*/ }
						{/*<button onClick={ this.onClickLeaveRoom }>Leave</button>*/ }
						{/*&nbsp;&nbsp;&nbsp;*/ }
						<input className="MessageInput"
						       autoFocus
						       placeholder="Say something ..."
						       value={ this.state.value }
						       onKeyDown={ this.onInputKeyDown }
						       onChange={ this.onInputValueChanged }></input>
						&nbsp;
						<button onClick={ this.onClickSendMessage }>Send</button>
						&nbsp;&nbsp;&nbsp;&nbsp;
						<button onClick={ this.onClickInvitation }>Invite</button>
						<PopupInvitation
							ref={ this.refPopupInvitation }
						></PopupInvitation>
					</div>
				}
				<div style={ { float : "left", clear : "both" } }
				     ref={ ( el ) =>
				     {
					     this.messagesEnd = el;
				     } }>
				</div>
			</div>
		);
	}
}
