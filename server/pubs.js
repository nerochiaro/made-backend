Meteor.publish('membersList', function() {
  return Members.find({}, { sort: { date: -1 } });
})

Meteor.publish('paymentsList', function() {
  return Payments.find({});
})

Meteor.publish('aliasesList', function() {
  return Aliases.find({});
})

Meteor.publish('movementsList', function() {
  return Movements.find({});
})