// FIXME: refactor in a common utils.js from here and movements.js
var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

Template.memberlist.helpers({
  members: function () {
    if (Session.get('current-tab') != 'members') return [];
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
  'payments': function () {
    var payments = Payments.find({ member: this._id }).fetch();
    var ids = _.pluck(payments, '_id');
    return Movements.find({_id: {$in: ids}}, {sort: { date: 1 }}).map(function(m) {
      var p = _.find(payments, function(p) { return p._id == m._id });
      if (p) m.payment = p;
      return m;
    })
  }
})

// Memberpicker is used by the history view

Template.memberpicker.helpers({
  members: function () {
    return Members.find({}, { sort: { date: -1 } });
  }
});

Template.memberPayments.helpers({
  months: function () {
    // get all membership-related payments belonging to
    // this member, for which a period has been specified,
    // and return them in chonological order.
    var p = Payments.find({$and: [
      {$or: [{type: 'Membership'}, {type: 'Member+Laser'}]},
      {member: this._id},
      {months: {$exists: 1}}
      ]}, {fields: {months: 1}}).fetch();

    if (p.length == 0) return [];

    // extract all periods and remove duplicates from all of them,
    // then convert them to moments so we can work on them easily
    p = _.sortBy(_.flatten(_.pluck(p, 'months')), _.identity);
    p = p.map(function(m) { return moment(m, 'YYYYMM')});

    // build the calendar for this user by adding months that
    // are present as-is, filling in the gaps with missing months,
    // and marking duplicate months as such.
    var cal = [];
    p.forEach(function(m) {
      if (cal.length == 0) cal.push(m);
      else {
        // order is chronological, so this will spot all duplicates
        var last = _.last(cal);
        if (last.isSame(m, 'month')) last.isDuplicate = true;
        else {
          // if this month is more than one month away from the last
          // we have a gap that we need to fill
          var d = m.diff(last, 'month');
          if (d > 1) {
            for (var i = 1; i < d; i++) {
              var missing = last.clone().add(i, 'month');
              missing.isMissing = true;
              cal.push(missing);
            }
          }
          cal.push(m);
        }
      }
    })
    return cal.map(function(m) { return {
      year: m.year(),
      month: m.format("MMM"),
      color: m.isDuplicate ? "red" : (m.isMissing ? "" : "green")
    }})
  },
  startYear: function(months) { return months ? months[0].year : "" }
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
