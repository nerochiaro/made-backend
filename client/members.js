// FIXME: refactor in a common utils.js from here and movements.js
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
  },
  showPayments: function() { return this._id == Session.get('current-member')}
});

Template.member.events({
  'click .ui.icon.remove-alias': function(event) {
    var alias = $(event.currentTarget).parent('div').first().attr('data-alias');
    if (alias) Meteor.call('aliasRemove', alias);
  },
  'click .member-payments': function(event) {
    console.log("payments", $(event.currentTarget).parents('tr').attr('data-member'))
    Session.set('current-member', $(event.currentTarget).parents('tr').attr('data-member'));
  }
});

Template.memberPaymentsList.helpers({
  'payments': function () {}
})

// Memberpicker is used by the history view

Template.memberpicker.helpers({
  members: function () {
    return Members.find({}, { sort: { date: -1 } });
  }
});

Template.memberPayments.helpers({
  months: function () {
    var p = Payments.find({$and: [
      {member: this._id},
      {type: 'Membership'},
      {months: {$exists: 1}}
      ]}, {fields: {months: 1}}).fetch();
    if (p.length == 0) return [];
    var cal = [];
    p = _.sortBy(_.flatten(_.pluck(p, 'months')), _.identity);
    p.map(function(m) { return moment(m, 'YYYYMM') }).forEach(function(m) {
      if (cal.length == 0) cal.push(m)
      else {
        if (_.last(cal).isSame(m, 'month')) _.last(cal).isDuplicate = true;
        else cal.push(m);
      }
    })
    return cal.map(function(m) { return {
      year: m.year(),
      month: m.format("MMM"),
      color: m.isDuplicate ? "red" : ""
    } });
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
