var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

Template.memberlist.helpers({
  members: function () {
    return Members.find({}, { sort: { date: -1 } });
  }
});

Template.member.helpers({
  joined: function() {
    var d = String(this.dateJoined).split(" ")[0].split("/");
    d = ["<small>" + d[2] + "</small>", monthNames[parseInt(d[0], 10) - 1], d[1]] ;
    return Spacebars.SafeString(d.join("&nbsp;"));
  },
  aliases: function() {
    return Aliases.find({user: String(this._id)});
  }
});

Template.member.events({
  'click .ui.icon.remove-alias': function(event) {
    var alias = $(event.currentTarget).parent('div').first().attr('data-alias');
    if (alias) Meteor.call('aliasRemove', alias);
  }
});

// Memberpicker is used by the history view

Template.memberpicker.helpers({
  members: function () {
    return Members.find({}, { sort: { date: -1 } });
  }
});

// This needs to stay globally declared as the table sorter will need
// to reassign the event after sorting
aliasPickClicked = function(event) {
  var member = $(event.currentTarget).parents('tr').attr('data-member');
  var movement = Session.get('current-payment');
  var alias = $('tr[data-id="' + movement + '"]').attr('data-alias');
  console.log("aliasing:", member, alias);
  Meteor.call('aliasAdd', member, alias);
  Session.set('current-payment', '-none-')
  $("#sidebar").sidebar('hide');
} 

memberPickClicked = function(event) {
  var member = $(event.currentTarget).parents('tr').attr('data-member');
  var payment = Session.get('current-payment');
  console.log("setting member:", payment, member);
  Meteor.call('paymentMemberSet', payment, member);
  Session.set('current-payment', '-none-')
  $("#sidebar").sidebar('hide');
} 

Template.memberPick.events({
  'click .ui.button.set-alias': aliasPickClicked,
  'click .ui.button.set-member': memberPickClicked  
});
