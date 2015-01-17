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
  }
});

Template.memberpicker.helpers({
  members: function () {
    return Members.find({}, { sort: { date: -1 } });
  }
});

memberPickClicked = function(event) {
  event.preventDefault();
  var user = $(event.currentTarget).attr('data-id');
  var alias = $(selectedMovement).attr('data-alias');
  console.log("aliasing:", user, alias);
  Meteor.call('aliasAdd', user, alias);
  $("#sidebar").sidebar('hide');
}

Template.memberPick.events({
  'click .member-pick-row': memberPickClicked
});
