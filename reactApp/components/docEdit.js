import React from 'react';
import { Button, Modal, ModalHeader, ModalBody, Input } from 'reactstrap';
import { Editor, EditorState, convertFromRaw, convertToRaw, SelectionState, Modifier, CompositeDecorator } from 'draft-js';
import customStyleMap from '../customMaps/customStyleMap';
import Toolbar from './Toolbar';
import extendedBlockRenderMap from '../customMaps/customBlockMap';
import axios from 'axios';
import SummaryTool from 'node-summary';

//import SaveModal from './saveModal'
var needsToSave = false;
var summ;
class DocEdit extends React.Component {
    constructor( props ) {
        super( props );
        this.state = {
            editorState: EditorState.createEmpty(),
            docId: this.props.match.params.docid,
            documentTitle: '',
            createModal: false,
            setInterval: "",
            searchTerm: ''
        };
        this.onChange = ( editorState ) => {
            this.setState( { editorState } );
            needsToSave = true;
            const rawDraftContentState = JSON.stringify( convertToRaw( editorState.getCurrentContent() ) );
            this.props.socket.emit( 'madeChange', rawDraftContentState );
            const newSelection = editorState.getSelection();
            if ( newSelection ) {
                const selectionInfo = {
                    anchorKey: newSelection.getAnchorKey(),
                    anchorOffset: newSelection.getAnchorOffset(),
                    focusKey: newSelection.getFocusKey(),
                    focusOffset: newSelection.getFocusOffset(),
                    isBackward: newSelection.isBackward
                };
                this.props.socket.emit( 'madeSelection', JSON.stringify( selectionInfo ) );
            }
            //console.log("pRIYA", this.state.editorState.getCurrentContent().contents)
            console.log("poop",  convertToRaw( this.state.editorState.getCurrentContent() ).blocks[0].text)
            summarizeText();
        };
        this.focus = () => this.refs.editor.focus();

    }


    toggleCreate() {
        this.setState( {
            createModal: !this.state.createModal,
        } );
    }

    _saveDocument() {
        const rawDraftContentState = JSON.stringify( convertToRaw( this.state.editorState.getCurrentContent() ) );
        if ( needsToSave ) {
            console.log( 'is saving every 30 seconds' );
            axios.post( 'http://localhost:3000/save', {

                contentState: rawDraftContentState,
                docId: this.state.docId
            } )
            .then( response => {
                console.log( 'Document successfully saved' );
            } )
            .catch( err => {
                console.log( 'error saving document', err );
            } );
            needsToSave = false;
        }
    }

    summarizeText(){
        SummaryTool.summarize(this.state.documentTitle, convertToRaw( this.state.editorState.getCurrentContent() ).blocks[0].text, function(err, summary) {
            if(err) console.log("Something went wrong man!");
            summ = summary;
            console.log("summARY", summary);

            console.log("Original Length " + (title.length + content.length));
            console.log("Summary Length " + summary.length);
            console.log("Summary Ratio: " + (100 - (100 * (summary.length / (title.length + content.length)))));
        });
    }

    search( e ) {
        const self = this;
        this.setState( { searchTerm: e.target.value }, (e) => {
            const highlightComposite = new CompositeDecorator( [{
                strategy: self.highlightStrategy.bind( self ),
                component: self.highlightSpan
            }] );
            self.setState( { editorState: EditorState.set( self.state.editorState, { decorator: highlightComposite } ) } );
        } );
    }

    highlightStrategy( contentBlock, callback, contentState ) {
        if ( this.state.searchTerm !== '' ) {
            this.findWithRegex( new RegExp( this.state.searchTerm, 'g' ), contentBlock, callback );
        }
    }

    findWithRegex( regex, contentBlock, callback ) {
        const text = contentBlock.getText();
        let matchArr, start, end;
        while ( ( matchArr = regex.exec( text ) ) !== null ) {
            start = matchArr.index;
            end = start + matchArr[0].length;
            callback( start, end );
        }
    }

    highlightSpan( props ) {
        return ( <span className="yellowHighlight">{ props.children }</span> );
    }

    componentWillMount() {
        var self = this;
        this.props.socket.emit( 'joinDocument', this.state.docId );
        this.props.socket.on( 'roomStatus', ( roomStatus ) => {
            console.log( 'room status', roomStatus );
        } );
        this.props.socket.on( 'userColor', ( userColor ) => {
            console.log( 'userColor', userColor );
        } );
        this.props.socket.on( 'changeListener', ( changedDoc ) => {
            self.updateContentFromSocket( changedDoc );
        } );
        this.props.socket.on( 'renderSelection', ( newSelection ) => {
            console.log( 'newS', newSelection );
            const userColor = 'cursor' + newSelection.userColor;
            newSelection = newSelection.ranges;
            const updateSelection = new SelectionState( {
                anchorKey: newSelection.anchorKey,
                anchorOffset: newSelection.anchorOffset,
                focusKey: newSelection.focusKey,
                focusOffset: Math.abs( newSelection.anchorOffset !== newSelection.focusOffset ) ? newSelection.focusOffset : newSelection.anchorOffset + 1,
                isBackward: newSelection.isBackward
            } );
            let newEditorState = EditorState.acceptSelection( this.state.editorState, updateSelection );
            newEditorState = EditorState.forceSelection( newEditorState, newEditorState.getSelection() );
            let contentWithCursor = newEditorState.getCurrentContent();
            console.log( 'userColor', userColor );
            contentWithCursor = Modifier.applyInlineStyle(
                contentWithCursor,
                updateSelection,
                userColor
                );
            this.setState( { saveInterval: setInterval( this._saveDocument.bind( this ), 30000 ) } );
            console.log( contentWithCursor );

            this.setState( { editorState: EditorState.createWithContent( contentWithCursor ) } );
        } );

        this.props.socket.on( 'currentState', ( currentState ) => {
            axios.post( "http://localhost:3000/loadDocument", {
                docId: this.state.docId
            } )
            .then( response => {
                let loadedContentState = convertFromRaw( JSON.parse( response.data.doc.contentState[response.data.doc.contentState.length - 1] ) );
                if ( currentState ) {
                    loadedContentState = convertFromRaw( JSON.parse( currentState ) );
                } else {
                    loadedContentState = convertFromRaw( JSON.parse( response.data.doc.contentState[response.data.doc.contentState.length - 1] ) );
                }
                this.setState( {
                    editorState: EditorState.createWithContent( loadedContentState ),
                    documentTitle: response.data.doc.title
                } );
            } )
            .catch( err => {
                console.log( 'error loading document', err );
            } );

        } );
    }

    updateContentFromSocket( changedDoc ) {
        changedDoc = convertFromRaw( JSON.parse( changedDoc ) );
        this.setState( { editorState: EditorState.createWithContent( changedDoc ) } );
    }

    componentWillUnmount() {
        this.props.socket.emit( 'leaveDocument', this.state.docId );
        this.props.socket.removeListener( 'changeListener' );
        this.props.socket.removeListener( 'message ' );
        this.props.socket.removeListener( 'docInfo' );
        this.props.socket.removeListener( 'userColor' );
        this.props.socket.removeListener( 'renderSelection' );
        clearInterval( this.state.saveInterval );
    }

    render() {
        const toggleCreate = this.toggleCreate.bind( this );
        return (
            <div>
            <div className="outlineBar">
            Show Outline
            <div className="outline">
                {summ}
            </div>
            </div>
            <Modal isOpen={ this.state.createModal } toggle={ toggleCreate } backdrop={ true }>
            <ModalHeader toggle={ toggleCreate }>Do you want to save?</ModalHeader>
            <ModalBody>
            <Button href="#/home" type="submit" onClick={ this._saveDocument.bind( this ) }>Save</Button>
            <Button href="#/home" type="submit">Leave without Saving</Button>
            </ModalBody>
            </Modal>
            <div className="backButton">
            <Button onClick={ toggleCreate }>Docs Home</Button>
            </div>
            <div>
            <h1>{ this.state.documentTitle }</h1>
            <p>ID: { this.state.docId }</p>
            </div>
            <Toolbar onSaveDocument={ this._saveDocument } docEdit={ this } />
            <div id='editor' onClick={ this.focus }>
            <Editor
            customStyleMap={ customStyleMap }
            editorState={ this.state.editorState }
            onChange={ this.onChange }
            ref="editor" blockRenderMap={ extendedBlockRenderMap }
            />
            </div>
            <div className="buttonLine">
            <Input id="search" placeholder="Search" onChange={ this.search.bind( this ) } />
            <Button href={ `#/history/${ this.state.docId }` }>Doc History</Button>
            </div>
            </div>
            );
    }
}

export default DocEdit;
