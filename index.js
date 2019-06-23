const EventEmitter = require('events');
const smpp = require("smpp");
const uuid = require("uuid/v4");

// let connectionObject = {
//     system_id: 'USER_NAME',
//     password: 'USER_PASSWORD',
//     interface_version: 1,
//     system_type: '380666000600',
//     address_range: '+380666000600',
//     addr_ton: 1,
//     addr_npi: 1,
// }

class SMPP extends EventEmitter{
    constructor(session,connectionObject){
        this.session = session;
        this.connectionObject = connectionObject;
        this.events = {
            bound_successfully:"bound_successfully",
            message_sent_successfully:"message_sent_succesfully",
            done_bulk_processing:"done_bulk_processing"
        }
        this.cache = {};
    }

    bindTransciever(){

        this.session.bind_transceiver({
            system_id: this.connectionObject.system_id,
            password: this.connectionObject.password,
            interface_version: this.connectionObject.interface_version,
            system_type: this.connectionObject.system_type ,
            address_range: this.connectionObject.address_range,
            addr_ton: this.connectionObject.addr_ton,
            addr_npi: this.connectionObject.addr_npi,
        }, (pdu) => {

          if (pdu.command_status == 0) {
              this.emit(this.events.bound_successfully,pdu);
          }
      
        });
      
    };

    sendSMS(from, to, message,correlationID){
        this.session.submit_sm({
            source_addr: from,
            destination_addr: to,
            short_message: message
        }, function(pdu) {
            if (pdu.command_status == 0) {
               this.emit(this.events.message_sent_successfully,{pdu,correlationID});
            }
        });
    }

    sendBulkSMS(from, destination, message,correlationID){
        let _cache_id = uuid();

            if(!correlationID){
                
                this.cache[_cache_id] = {last_sent_index:undefined,start_index:0,length:destination.length,correlationID};

                this.recursiveSend(from, destination, message,null,_cache_id);
                return;

            };

            this.cache[_cache_id] = {last_sent_index:undefined,start_index:0,length:destination.length,correlationID};
            this.recursiveSend(from, destination, message,correlationID,this.cache[_cache_id] ? _cache_id : uuid());
    }


    recursiveSend(from, destination, message,correlationID,_cache_id){
            if(_cache_id){

                if(this.cache[_cache_id].length -1  < this.cache[_cache_id].last_sent_index){
                    //out of range
                   return;
                }

                if(this.cache[_cache_id].length -1 === this.cache[_cache_id].last_sent_index){
                    this.session.submit_sm({
                        source_addr: from,
                        destination_addr: destination[this.cache[_cache_id].last_sent_index],
                        short_message: message
                    }, function(pdu) {
                        if (pdu.command_status == 0) {
                           this.emit(this.events.message_sent_successfully,{pdu,correlationID});
                           this.cache[_cache_id].last_sent_index += 1;
                            this.emit(`${this.events.done_bulk_processing}-${correlationID}`)
                        }
                    });
                    return;
              };

               //check if start
               if(!this.cache[_cache_id].last_sent_index){
                //start processing
                this.cache[_cache_id].last_sent_index = this.cache[_cache_id].start_index;
                this.session.submit_sm({
                    source_addr: from,
                    destination_addr: destination[this.cache[_cache_id].last_sent_index],
                    short_message: message
                }, function(pdu) {
                    if (pdu.command_status == 0) {
                       this.emit(this.events.message_sent_successfully,{pdu,correlationID});
                       this.cache[_cache_id].last_sent_index += 1;
                       this.recursiveSend(from, destination, message,correlationID,_cache_id);
                    }
                });

                return;

          }

          //continue processing
            this.session.submit_sm({
                source_addr: from,
                destination_addr: destination[this.cache[_cache_id].last_sent_index],
                short_message: message
            }, function(pdu) {
                if (pdu.command_status == 0) {
                this.emit(this.events.message_sent_successfully,{pdu,correlationID});
                this.cache[_cache_id].last_sent_index += 1;
                this.recursiveSend(from, destination, message,correlationID,_cache_id);
                }
            });


             
            };
    };

}




export default SMPP