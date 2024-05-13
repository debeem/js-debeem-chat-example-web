import React, { Component } from "react";
import { PopupComponent } from "../PopupComponent/PopupComponent";
import "./PopupMemberList.css";
import {
	ChatRoomMember,
	ChatRoomMemberType, ChatType,
	ClientRoom,
	VaChatRoomEntityItem
} from "debeem-chat-client";
import { ChatRoomEntityItem, ChatRoomMembers } from "debeem-chat-client";
import _ from "lodash";
import { UserService } from "../../services/UserService";


export type PopupMemberListCallback = ( data : any ) => void;

export interface PopupMemberListProps
{
	callback : PopupMemberListCallback;
}

export interface PopupMemberListState
{
	showPopup : boolean;
	roomMembers : Array<ChatRoomMember>
}

export class PopupMemberList extends Component<PopupMemberListProps, PopupMemberListState>
{
	private userService : UserService = new UserService();
	private clientRoom : ClientRoom = new ClientRoom();
	private roomItem !: ChatRoomEntityItem;

	constructor( props : any )
	{
		super( props );
		this.state = {
			showPopup : false,
			roomMembers : [],
		};

		//	...
		this.togglePopup = this.togglePopup.bind( this );
		this.onClickDeleteMember = this.onClickDeleteMember.bind( this );
	}

	public togglePopup()
	{
		this.setState( {
			showPopup : ! this.state.showPopup,
		} );
	}

	public loadMembers( roomId : string )
	{
		this.asyncLoadMembers( roomId ).then( ( members : ChatRoomMembers ) =>
		{
			if ( _.isObject( members ) )
			{
				const roomMembers = _.values( members );
				this.setState({
					roomMembers : roomMembers,
				});
			}

		}).catch( err =>
		{
			window.alert( err );
		});
	}

	private asyncLoadMembers( roomId : string ) : Promise<ChatRoomMembers>
	{
		return new Promise( async ( resolve, reject ) =>
		{
			try
			{
				const walletObject = this.userService.getWallet();
				if ( ! walletObject )
				{
					window.alert( `failed to create walletObj` );
					return reject( `failed to create walletObj` );
				}

				if ( null !== VaChatRoomEntityItem.isValidRoomId( roomId ) )
				{
					window.alert( `invalid roomId` );
					return reject( `invalid roomId` );
				}

				const roomItem : ChatRoomEntityItem | null = await this.clientRoom.queryRoom( walletObject.address, roomId );
				if ( ! _.isObject( roomItem ) )
				{
					window.alert( `room not found` );
					return reject( `room not found` );
				}
				this.roomItem = roomItem;

				//	...
				const chatRoomMembers : ChatRoomMembers = await this.clientRoom.queryMembers( walletObject.address, roomId );

				//	...
				resolve( chatRoomMembers );
			}
			catch ( err )
			{
				reject( err );
			}
		} );
	}

	onClickDeleteMember( wallet : string )
	{
		const walletObject = this.userService.getWallet();
		if ( ! walletObject )
		{
			window.alert( `failed to get walletObj` );
			return;
		}

		if ( ! this.roomItem )
		{
			window.alert( `room not ready` );
			return;
		}
		if ( ChatType.PRIVATE === this.roomItem.chatType )
		{
			window.alert( `members in private chat room are not allowed to be deleted` );
			return;
		}

		this.clientRoom.getMember( walletObject.address, this.roomItem.roomId, wallet ).then( async ( member : ChatRoomMember | null ) =>
		{
			if ( ! _.isObject( member ) )
			{
				window.alert( `member not found` );
				return;
			}
			if ( ChatRoomMemberType.OWNER === member.memberType )
			{
				window.alert( `owner cannot be deleted` );
				return;
			}

			if ( window.confirm( `Are you sure you want to delete this member?` ) )
			{
				const deleted : boolean = await this.clientRoom.deleteMember( walletObject.address, this.roomItem.roomId, wallet );
				if ( deleted )
				{
					window.alert( `deleted successfully` );
					this.togglePopup();
					if ( _.isFunction( this.props.callback ) )
					{
						this.props.callback( deleted );
					}
				}
				else
				{
					window.alert( `deleted unsuccessfully` );
				}
			}
		} ).catch( err =>
		{
			window.alert( `failed to load the member` );
			return;
		})

	}

	render()
	{
		return (
			<div className="container">
				{ this.state.showPopup &&
					<PopupComponent onClose={ this.togglePopup }>
						<div className="titleDiv">Join a Room</div>
						<div className="memberList">
							{ this.state.roomMembers.map( ( item : ChatRoomMember ) =>
								<div key={ item.wallet }
								     data-id={ item.wallet } className="memberListItem">
									<div className="memberInfoBox">
										<div className="memberName">
											{ item.userName }
											&nbsp;/&nbsp;
											{ ChatRoomMemberType.OWNER === item.memberType ? 'OWNER' : 'MEMBER' }
										</div>
										<div className="memberWallet">{ item.wallet }</div>
										<div className="memberCreatedTime">{ item.timestamp ? new Date( item.timestamp ).toLocaleString() : 'null' }</div>
									</div>
									<div className="memberOptBox">
										<a onClick={ ( _e ) =>
										{
											this.onClickDeleteMember( item.wallet )
										} }>Delete</a>
									</div>
								</div>
							) }
						</div>
					</PopupComponent>
				}
			</div>
		);
	}
}
