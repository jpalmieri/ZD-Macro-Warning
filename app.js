/*global confirm */
/* The basic idea behind this app is that when a ticket is pulled up, we record
all the tags on it.When an agent chooses a macro, the macro applies a custom tag
that is specific to that macro.We then record all the tags on the ticket and
compare it against the initial tags. Any new tags are passed to the Zendesk
search API, where we check to see if those tags have ever been used on any
tickets this player submitted in the last year. If they have, we warn the agent.
If the agent confirms they are going to change the macro, we adjust the tagging
to indicate that. If the agent confirms they plan to send the macro anyways, we
make a note of it so that we can check CSAT later on.
Minor limitation: it doesn't currently check if the macro the agent is applying
has been used on that ticket before. That could be added, but also shouldn't
really be necessary.
*/

(function () {

  // Set tagsOld as a global variable, is only updated when ticket loads.
  var tagsOld = [];


  // Compare two arrays, used to compare the new tags to the old tags.
  Array.prototype.diff = function(a) {
      return this.filter(function(i) {return a.indexOf(i) < 0;});
  };


  return {
    events: {
      // Places all original tags on the ticket in tagsOld
      'app.activated':'checkInitialTags',
      'panel.activated':'checkInitialTags',
      // Any time a tag is added/removed, see if a warning is necessary.
      'ticket.tags.changed':'checkChangedTags'
    },

    requests: {
      /*
      This function accepts an array of tags to search for, the year minus one
      (to search the last year's worth of tickets),current month plus one (to
      adjust from a 0-11 to 1-12 format), day of the month, and player ID since
      we only care if the requester has seen this macro before.
      */
      checkOld: function(tocheck,year,month,day,id) {
        return {
          url: '/api/v2/search.json?query=tags:' + tocheck + '+created>' +
            year + '-' + month + '-' + day + '+type:ticket+requester:' + id,
          type: 'GET',
          dataType: 'json'
        };
      }

    },

    // Gather all tags on a ticket at runtime
    pullTags: function(arrayToFill){
      var tags = this.ticket().tags();
      for (var j = 0; j < tags.length; j++) {
          arrayToFill.push(tags[j]);
        }
      return arrayToFill;
    },

    // Grab initial tags. It then switches to a generic "monitoring" screen.
    checkInitialTags: function(){
      tagsOld.length = 0;
      this.pullTags(tagsOld);
      this.switchTo('clear');
      },

    checkChangedTags: function(){
      var tagsCurrent = [];
      this.pullTags(tagsCurrent);
      // Return tags added to ticket in the change.
      var difference = tagsCurrent.diff(tagsOld);
      // Gather all the information needed to pass to the Zendesk search API.
      var ticket = this.ticket();
      var id = ticket.requester().id();
      var d = new Date();
      var year = d.getFullYear()-1;
      var month = d.getMonth()+1;
      var day = d.getDate();
      var request = this.ajax('checkOld', difference, year, month, day, id);
      // when response received, run showWarning, passing in response
      request.done( function(data) {
        // if prior tags are found:
        if (data.count !== 0) {
          // switch to warning template
          this.switchTo('warn', {warnings: data.count});
          // popup warning
          var r = confirm("Warning!\n\nThe player has already seen this macro "+
            data.count + " time(s) within the last year.\n\nChoose OK if you"+
            " plan to send it as is.\nChoose Cancel if you plan to adjust it"+
            " or choose a new macro.");
          // if the agent still wants to send the macro, mark "duplicate"
          if (r === true) {
            ticket.customField("custom_field_24937008","yes");
          // if the agent edits the macro/deletes it, remove the tag/field
          } else {
            ticket.tags().remove(difference);
            this.switchTo('clear');
            ticket.customField("custom_field_24937008","no");
          }
        //if no prior tags are found, no warning
        } else{
          this.switchTo('clear');
          ticket.customField("custom_field_24937008","no");
        }
      }
    );
    },
  };

}());
