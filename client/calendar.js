// FIXME: refactor in a common utils.js from here and movements.js
var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var END_OF_TIME = 99999999

// you can pass either a moment, or a YYYYMM string
UI.registerHelper('monthName', function(context, options) {
  // this will work because if context is a moment the second argument is ignored
  return moment(context, 'YYYYMM').format('MMM');
});

Template.calendar.helpers({
  data: function () {
    if (Session.get('current-tab') != 'calendar') return [];
    var members = Members.find({});
    var firstPayment = END_OF_TIME;
    var lastPayment = 0;
    var paymentsPerMember = members.map(function(m) {
      m.dateJoined = moment(m.dateJoined).format("YYYYMMDD")
      var payments = paymentsForMember(m);
      if (payments && payments.length) {
        firstPayment = Math.min(firstPayment, parseInt(payments[0], 10));
        lastPayment = Math.max(lastPayment, parseInt(payments[payments.length-1], 10));
      }
      return { member: m, payments: payments }
    });
    paymentsPerMember = _.sortBy(paymentsPerMember, function(m) { return m.member.dateJoined })
    return {
      members: paymentsPerMember,
      span: calendarSpan(firstPayment, lastPayment)
    }
  },
  payingMembers: function(members) {
    return _.filter(members, function(m) { return m.payments.length > 0 })
  },
  totals: function() {
    var counts = _.countBy(_.flatten(_.pluck(this.members, "payments")), _.identity)
    return this.span.map(function(m) { return counts[m.format('YYYYMM')] || 0 })
  }
});

Template.memberData.helpers({
  hasPaidMonth: function(payments) {
    var current = this.format('YYYYMM');
    return _.find(payments, function(month) {
      return current == month
    }) !== undefined;
  }
})

function paymentsForMember(member) {
  var p = Payments.find({$and: [
    {member: member._id},
    {$or: [{type: 'Membership'}, {type: 'Member+Laser'}]},
    {months: {$exists: 1}}
    ]}, {fields: {months: 1}}).fetch();
  if (p.length == 0) return [];
  return _.sortBy(_.flatten(_.pluck(p, 'months')), _.identity);
}

function calendarSpan(first, last) {
    if (last < first) return []

    var current = moment(first, 'YYYYMM');
    var last = moment(last, 'YYYYMM');
    var diff = last.diff(current, 'month');
    var months = [];
    for (var i = 0; i <= diff; i++) {
      months.push(current.clone());
      current.add(1, 'month'); // modify the moment in place
    }
    return months;
  }
